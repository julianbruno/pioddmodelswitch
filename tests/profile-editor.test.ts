import assert from "node:assert/strict";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import test from "node:test";

import type { BalanceConsultation } from "../extensions/model-profiles/balancing.ts";
import { buildModelCatalog, type CatalogModel } from "../extensions/model-profiles/catalog.ts";
import {
  agentChoice,
  modelChoice,
  normalizeAvailableModels,
  supportedThinking,
  runProfileEditor,
  SAVE_OPTION,
  THINKING_LEVELS,
  type ProfileEditorIO,
  type ProfileEditorUI,
} from "../extensions/model-profiles/editor.ts";

const agents = ["orchestrator", "gentle-ai-explore", "review-risk"];
const date = "2026-01-01T00:00:00.000Z";

function profile(prefix: string, thinking = "high"): Record<string, { model: string; thinking: string }> {
  return Object.fromEntries(agents.map((agent) => [agent, { model: `${prefix}/${agent}`, thinking }]));
}

function catalogEntry(provider: string, id: string, name = id): CatalogModel {
  return {
    provider,
    id,
    model: `${provider}/${id}`,
    name,
    reasoning: true,
    contextWindow: 1000,
    maxTokens: 256,
    input: ["text"],
  };
}

function catalogFor(prefixes: string[], extra: CatalogModel[] = []) {
  const models = prefixes.flatMap((prefix) => agents.map((agent) => catalogEntry(prefix, agent, `${prefix} ${agent}`)));
  return buildModelCatalog([...models, ...extra], date);
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJson(path: string): Promise<any> {
  return JSON.parse(await readFile(path, "utf8"));
}

async function snapshotTree(root: string): Promise<Array<{ path: string; type: "dir" | "file"; mtimeMs: number; content?: string }>> {
  const records: Array<{ path: string; type: "dir" | "file"; mtimeMs: number; content?: string }> = [];
  async function walk(path: string): Promise<void> {
    const current = await stat(path);
    records.push({ path: relative(root, path) || ".", type: current.isDirectory() ? "dir" : "file", mtimeMs: current.mtimeMs });
    if (!current.isDirectory()) {
      records[records.length - 1].content = await readFile(path, "utf8");
      return;
    }
    for (const entry of (await readdir(path, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
      await walk(join(path, entry.name));
    }
  }
  await walk(root);
  return records;
}

async function createEditorHarness(options: { catalog?: unknown; omitCatalog?: boolean } = {}) {
  const root = await mkdir(join(tmpdir(), `profile-editor-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`), { recursive: true });
  const gentleDir = join(root, "gentle-ai");
  await mkdir(gentleDir, { recursive: true });
  const manifest = {
    schemaVersion: 2,
    defaultProfile: "openai",
    managedAgentGroups: { odd: ["orchestrator", "gentle-ai-explore"] },
    reservedCommandNames: ["status", "list", "preview", "doctor", "undo", "recover"],
    oppositeProviderJudges: { enabled: true, agents: ["review-risk"], profilePairs: { openai: "grok", grok: "openai" } },
    profiles: [
      { name: "openai", modelsFile: "models.openai.json" },
      { name: "grok", modelsFile: "models.grok.json" },
    ],
  };
  await writeJson(join(gentleDir, "model-profiles.manifest.json"), manifest);
  await writeJson(join(gentleDir, "models.openai.json"), profile("openai-codex", "high"));
  await writeJson(join(gentleDir, "models.grok.json"), profile("xai", "medium"));
  await writeJson(join(gentleDir, "models.json"), { ...profile("openai-codex", "high"), unmanaged: { model: "keep/me", thinking: "low" } });
  if (!options.omitCatalog) {
    await writeJson(join(gentleDir, "model-catalog.json"), options.catalog ?? catalogFor(["openai-codex", "xai"], [catalogEntry("acme", "replacement", "Replacement")]));
  }
  return {
    root,
    gentleDir,
    manifestPath: join(gentleDir, "model-profiles.manifest.json"),
    catalogPath: join(gentleDir, "model-catalog.json"),
    canonicalPath: join(gentleDir, "models.json"),
    omitCatalog: options.omitCatalog,
    liveModels: (options.catalog as any)?.models ?? catalogFor(["openai-codex", "xai"], [catalogEntry("acme", "replacement", "Replacement")]).models,
  };
}

type ScriptValue = string | boolean | undefined;
type Script = ScriptValue | ((title: string, options?: string[]) => ScriptValue | Promise<ScriptValue>);

function scriptedUi(steps: Script[]) {
  const notifications: Array<{ message: string; type?: string }> = [];
  let index = 0;
  const next = (kind: string, title: string, options?: string[]) => {
    if (index >= steps.length) throw new Error(`Unexpected ${kind} (${title}); script exhausted`);
    const step = steps[index++];
    return typeof step === "function" ? step(title, options) : step;
  };
  const ui: ProfileEditorUI = {
    select: async (title, options) => await next("select", title, options) as string | undefined,
    confirm: async (title, message) => Boolean(await next("confirm", `${title}\n${message}`)),
    input: async (title) => await next("input", title) as string | undefined,
    notify: (message, type) => notifications.push({ message, type }),
  };
  return { ui, notifications, remaining: () => steps.length - index };
}

async function run(h: Awaited<ReturnType<typeof createEditorHarness>>, steps: Script[], io?: ProfileEditorIO) {
  const script = scriptedUi(steps);
  const result = await runProfileEditor(script.ui, {
    gentleDir: h.gentleDir,
    manifestPath: h.manifestPath,
    catalogPath: h.catalogPath,
  }, io, h.omitCatalog ? undefined : { getAvailable: () => h.liveModels });
  return { ...script, result };
}

async function balanceRun(h: Awaited<ReturnType<typeof createEditorHarness>>, steps: Script[], options: {
  infer?: (data: any) => Promise<unknown>;
  available?: () => unknown;
  thinking?: string;
  timeoutMs?: number;
  api?: string;
  nativeProvider?: unknown;
} = {}) {
  const script = scriptedUi(steps);
  const calls: any[] = [];
  const controller = new AbortController();
  let captures = 0;
  const adapter: BalanceConsultation = {
    capture: () => { captures++; return { model: { ...h.liveModels.find((m: any) => m.provider === "openai-codex" && m.id === "orchestrator"), api: options.api ?? "anthropic-messages", maxTokens: 65536, contextWindow: 131072 }, thinking: options.thinking ?? "high" }; },
    streamSimple: (model, context: any, callOptions) => {
      const data = JSON.parse(context.messages[0].content[0].text);
      calls.push({ model, data, options: callOptions });
      return { result: () => options.infer ? options.infer(data) : Promise.resolve({ stopReason: "stop", content: [{ type: "text", text: JSON.stringify({
        assignments: data.roles.map((r: any) => ({ role: r.role, model: data.models[0].model, thinking: "high", rationale: "Advisory role allocation." })),
      }) }] }) };
    },
    progress: work => work(controller.signal),
    timeoutMs: options.timeoutMs,
  };
  const result = await runProfileEditor(script.ui, h, undefined, {
    getAvailable: options.available ?? (() => h.liveModels),
    getRegisteredNativeProvider: () => options.nativeProvider,
    getRegisteredProviderConfig: () => undefined,
  }, adapter);
  return { ...script, result, calls, captures, controller };
}
const balanceSteps: Script[] = ["Balance", "grok", "Automatic balanced defaults", true, true, "balanced-new", true];

test("Balance automatic defaults use all live models/full roles/current effort and save new without activation", async () => {
  const h = await createEditorHarness();
  const canonical = await readFile(h.canonicalPath, "utf8");
  const original = await readFile(join(h.gentleDir, "models.grok.json"), "utf8");
  const result = await balanceRun(h, ["Balance", "grok", "Automatic balanced defaults", title => {
    assert.match(title, /CURRENT openai-codex\/orchestrator.*high/);
    assert.match(title, /Possible provider cost/);
    assert.match(title, /No chat history, source/);
    return true;
  }, title => {
    for (const agent of agents) assert.ok(title.includes(`${agent}:`));
    assert.match(title, /Rationale:/);
    assert.match(title, /Advisory/);
    return true;
  }, "balanced-new", true]);
  assert.equal(result.result.wrote, true, JSON.stringify(result.notifications));
  assert.equal(result.calls.length, 1);
  assert.equal(result.captures, 1);
  const data = result.calls[0].data;
  assert.equal(data.criteria.priority, "balanced");
  assert.equal(data.models.length, h.liveModels.length);
  assert.deepEqual(data.roles.map((r: any) => r.role), agents);
  assert.equal(data.reference.orchestrator.model, "xai/orchestrator");
  assert.equal(data.current.thinking, "high");
  assert.equal(result.calls[0].options.reasoning, "high");
  assert.equal(await readFile(h.canonicalPath, "utf8"), canonical);
  assert.equal(await readFile(join(h.gentleDir, "models.grok.json"), "utf8"), original);
  assert.ok((await readJson(h.manifestPath)).profiles.some((p: any) => p.name === "balanced-new"));
});

for (const [label, steps, calls] of [
  ["reference cancel", ["Balance", undefined], 0],
  ["criteria cancel", ["Balance", "grok", undefined], 0],
  ["decline consent", ["Balance", "grok", "Automatic balanced defaults", false], 0],
  ["custom priority cancel", ["Balance", "grok", "Customize", undefined], 0],
  ["custom context cancel", ["Balance", "grok", "Customize", "budget", undefined], 0],
  ["preview cancel", ["Balance", "grok", "Automatic balanced defaults", true, false], 1],
  ["name cancel", [...balanceSteps.slice(0, 5), undefined], 1],
  ["save decline", [...balanceSteps.slice(0, 6), false], 1],
] as [string, Script[], number][]) test(`Balance ${label} writes nothing`, async () => {
  const h = await createEditorHarness();
  const before = await snapshotTree(h.root);
  const r = await balanceRun(h, steps);
  assert.equal(r.result.wrote, false);
  assert.equal(r.calls.length, calls);
  assert.deepEqual(await snapshotTree(h.root), before);
});

test("Balance customization is optional and sent as bounded criteria", async () => {
  const h = await createEditorHarness();
  const r = await balanceRun(h, ["Balance", "grok", "Customize", "budget", "Low risk", true, false]);
  assert.deepEqual(r.calls[0].data.criteria, { priority: "budget", taskRisk: "Low risk" });
});

test("Balance preserves captured off/minimal using installed capability defaults", async () => {
  for (const thinking of ["off", "minimal"]) {
    const h = await createEditorHarness();
    const r = await balanceRun(h, [...balanceSteps.slice(0, 4), false], { thinking });
    assert.equal(r.calls.length, 1);
    assert.equal(r.calls[0].data.current.thinking, thinking);
    assert.equal(r.calls[0].options.reasoning, thinking === "off" ? undefined : thinking);
  }
});

test("Balance rejects unsupported captured effort before provider call", async () => {
  const h = await createEditorHarness();
  const r = await balanceRun(h, balanceSteps.slice(0, 3), { thinking: "max" });
  assert.equal(r.calls.length, 0);
  assert.equal(r.result.wrote, false);
});

for (const when of ["inference", "confirm"]) test(`Balance detects drift during ${when}`, async () => {
  const h = await createEditorHarness();
  const path = join(h.gentleDir, "models.grok.json");
  const external = JSON.stringify(profile("external"));
  const infer = async (data: any) => {
    if (when === "inference") await writeFile(path, external);
    return { stopReason: "stop", content: [{ type: "text", text: JSON.stringify({ assignments: data.roles.map((r: any) => ({ role: r.role, model: data.models[0].model, thinking: "high", rationale: "Advisory" })) }) }] };
  };
  const steps = [...balanceSteps];
  if (when === "confirm") steps[6] = async () => { await writeFile(path, external); return true; };
  const r = await balanceRun(h, steps, { infer });
  assert.equal(r.result.wrote, false);
  assert.equal(await readFile(path, "utf8"), external);
  assert.equal((await readJson(h.manifestPath)).profiles.length, 2);
  assert.equal((await readdir(h.gentleDir)).includes("models.balanced-new.json"), false);
});

for (const change of ["identity", "thinking", "registry"]) test(`Balance refresh catches ${change} loss before persistence`, async () => {
  const h = await createEditorHarness();
  const before = await snapshotTree(h.root);
  let reads = 0;
  const r = await balanceRun(h, balanceSteps, { available: () => {
    reads++;
    if (reads < 3) return h.liveModels;
    if (change === "registry") throw new Error("PRIVATE auth detail");
    return change === "identity" ? h.liveModels.slice(1) : h.liveModels.map((m: any) => ({ ...m, thinkingLevelMap: { high: null } }));
  } });
  assert.equal(reads, 3);
  assert.equal(r.result.wrote, false);
  assert.deepEqual(await snapshotTree(h.root), before);
});

for (const mode of ["error", "invalid", "timeout"]) test(`Balance ${mode} never saves or retries`, async () => {
  const h = await createEditorHarness();
  const before = await snapshotTree(h.root);
  const r = await balanceRun(h, balanceSteps.slice(0, 4), { timeoutMs: 10, infer: async () => {
    if (mode === "error") throw new Error("PRIVATE provider detail");
    if (mode === "timeout") return new Promise(() => {});
    return { stopReason: "stop", content: [{ type: "text", text: "invalid" }] };
  } });
  assert.equal(r.result.wrote, false);
  assert.equal(r.calls.length, 1);
  assert.equal(r.notifications.some(n => n.message.includes("PRIVATE")), false);
  assert.deepEqual(await snapshotTree(h.root), before);
});

for (const [label, extra] of [
  ["codex responses", { api: "openai-codex-responses" }],
  ["unknown API", { api: "custom-api" }],
  ["extension-registered provider", { nativeProvider: {} }],
] as [string, Record<string, unknown>][]) test(`Balance refuses ${label} before consent or any provider call`, async () => {
  const h = await createEditorHarness();
  const before = await snapshotTree(h.root);
  const r = await balanceRun(h, balanceSteps.slice(0, 3), extra);
  assert.equal(r.calls.length, 0);
  assert.equal(r.remaining(), 0);
  assert.equal(r.result.wrote, false);
  assert.match(r.notifications.at(-1)?.message ?? "", /output cap/);
  assert.deepEqual(await snapshotTree(h.root), before);
});

test("Balance invalid name re-prompts and saves without re-inference", async () => {
  const h = await createEditorHarness();
  const r = await balanceRun(h, [...balanceSteps.slice(0, 5), "Bad Name", "openai", "balanced-new", true]);
  assert.equal(r.result.wrote, true);
  assert.equal(r.calls.length, 1);
  const errors = r.notifications.filter(n => n.type === "error").map(n => n.message);
  assert.equal(errors.length, 2);
  for (const message of errors) assert.match(message, /lowercase/);
  assert.ok((await readJson(h.manifestPath)).profiles.some((p: any) => p.name === "balanced-new"));
});

test("Balance invalid name then cancel writes nothing after one call", async () => {
  const h = await createEditorHarness();
  const before = await snapshotTree(h.root);
  const r = await balanceRun(h, [...balanceSteps.slice(0, 5), "../x", undefined]);
  assert.equal(r.result.wrote, false);
  assert.equal(r.result.cancelled, true);
  assert.equal(r.calls.length, 1);
  assert.deepEqual(await snapshotTree(h.root), before);
});

test("existing editor actions never consult", async () => {
  for (const steps of [["View", "grok"], ["Edit", "grok", undefined], ["Create", undefined]]) {
    const h = await createEditorHarness();
    const r = await balanceRun(h, steps);
    assert.equal(r.calls.length, 0);
    assert.equal(r.captures, 0);
  }
});

test("Balance is explicitly offered without inference on opening", async () => {
  const h = await createEditorHarness();
  await run(h, [(_title, choices) => {
    assert.ok(choices?.includes("Balance"));
    return undefined;
  }]);
});

test("view works without a catalog and never writes", async () => {
  const h = await createEditorHarness({ omitCatalog: true });
  const before = await snapshotTree(h.root);
  const { result, notifications } = await run(h, ["View", "openai"]);
  assert.equal(result.wrote, false);
  assert.match(notifications.at(-1)?.message ?? "", /Profile: openai/);
  assert.match(notifications.at(-1)?.message ?? "", /orchestrator: openai-codex\/orchestrator \(high\)/);
  assert.match(notifications.at(-1)?.message ?? "", /review-risk: openai-codex\/review-risk \(high\)/);
  assert.deepEqual(await snapshotTree(h.root), before);
});

test("edit and create require a live registry without catalog fallback", async () => {
  for (const action of ["Edit", "Create"]) {
    const h = await createEditorHarness({ omitCatalog: true });
    const before = await snapshotTree(h.root);
    const { result, notifications } = await run(h, [action]);
    assert.equal(result.wrote, false);
    assert.match(notifications.at(-1)?.message ?? "", /live.*registry/i);
    assert.deepEqual(await snapshotTree(h.root), before);
  }

  const invalid = await createEditorHarness({ catalog: { schemaVersion: 1 } });
  const beforeInvalid = await snapshotTree(invalid.root);
  const viewed = await run(invalid, ["View", "grok"]);
  assert.equal(viewed.result.wrote, false);
  assert.match(viewed.notifications.at(-1)?.message ?? "", /Profile: grok/);
  const script = scriptedUi(["Edit"]);
  const edited = { ...script, result: await runProfileEditor(script.ui, invalid) };
  assert.equal(edited.result.wrote, false);
  assert.match(edited.notifications.at(-1)?.message ?? "", /registry/i);
  assert.deepEqual(await snapshotTree(invalid.root), beforeInvalid);
});

test("cancellation at any dialog writes nothing", async () => {
  const h = await createEditorHarness();
  const before = await snapshotTree(h.root);
  for (const steps of [
    [undefined],
    ["Edit", undefined],
    ["Edit", "openai", undefined],
    ["Create", undefined],
    ["Create", "local", undefined],
    ["Create", "local", "openai", undefined],
    ["Edit", "openai", SAVE_OPTION, false, undefined],
  ] as Script[][]) {
    const { result } = await run(h, steps);
    assert.equal(result.wrote, false, String(steps[0]));
    assert.deepEqual(await snapshotTree(h.root), before);
  }
});

test("edit saves live selections into the named profile without applying the active profile", async () => {
  const h = await createEditorHarness();
  const beforeCanonical = await readFile(h.canonicalPath, "utf8");
  const beforeManifest = await readFile(h.manifestPath, "utf8");
  const replacement = modelChoice(catalogEntry("acme", "replacement", "Replacement"));
  const { result, notifications } = await run(h, [
    "Edit",
    "openai",
    (title, options) => {
      assert.match(title, /openai/);
      assert.ok(options?.includes(SAVE_OPTION));
      return options?.find((option) => option.startsWith("orchestrator:")) ?? "";
    },
    replacement,
    "low",
    SAVE_OPTION,
    true,
  ]);
  assert.equal(result.wrote, true);
  assert.match(notifications.at(-1)?.message ?? "", /Saved profile openai/);
  assert.match(notifications.at(-1)?.message ?? "", /not changed/);
  assert.deepEqual((await readJson(join(h.gentleDir, "models.openai.json"))).orchestrator, { model: "acme/replacement", thinking: "low" });
  assert.deepEqual((await readJson(join(h.gentleDir, "models.openai.json")))["gentle-ai-explore"], { model: "openai-codex/gentle-ai-explore", thinking: "high" });
  assert.equal(await readFile(h.canonicalPath, "utf8"), beforeCanonical);
  assert.equal(await readFile(h.manifestPath, "utf8"), beforeManifest);
});

test("create clones a complete template, registers it, and leaves the active profile untouched", async () => {
  const h = await createEditorHarness();
  const beforeCanonical = await readFile(h.canonicalPath, "utf8");
  const { result } = await run(h, ["Create", "local", "grok", SAVE_OPTION, true]);
  assert.equal(result.wrote, true);
  const created = await readJson(join(h.gentleDir, "models.local.json"));
  assert.deepEqual(created, profile("xai", "medium"));
  const manifest = await readJson(h.manifestPath);
  assert.deepEqual(manifest.profiles.at(-1), { name: "local", modelsFile: "models.local.json" });
  assert.equal(manifest.defaultProfile, "openai");
  assert.equal(manifest.oppositeProviderJudges.profilePairs.local, undefined);
  assert.equal(await readFile(h.canonicalPath, "utf8"), beforeCanonical);
  assert.equal(await readFile(join(h.gentleDir, "models.grok.json"), "utf8"), `${JSON.stringify(profile("xai", "medium"), null, 2)}\n`);
});

test("create preserves external manifest or template changes made during confirmation", async () => {
  for (const target of ["manifest", "template"]) {
    const h = await createEditorHarness();
    const changedPath = target === "manifest" ? h.manifestPath : join(h.gentleDir, "models.openai.json");
    let externalTree: Awaited<ReturnType<typeof snapshotTree>> | undefined;
    const { result, notifications } = await run(h, ["Create", "local", "openai", SAVE_OPTION, async () => {
      // Even a formatting-only change must not be overwritten by the stale registry.
      await writeFile(changedPath, `${await readFile(changedPath, "utf8")} \n`, "utf8");
      externalTree = await snapshotTree(h.root);
      return true;
    }]);
    assert.deepEqual(result, { wrote: false, cancelled: false }, target);
    assert.match(notifications.at(-1)?.message ?? "", /changed.*reopen/i, target);
    assert.equal(notifications.at(-1)?.type, "error");
    assert.deepEqual(await snapshotTree(h.root), externalTree, target);
  }
});

test("edit preserves external profile or manifest updates made during confirmation", async () => {
  for (const target of ["profile", "manifest"]) {
    const h = await createEditorHarness();
    const changedPath = target === "manifest" ? h.manifestPath : join(h.gentleDir, "models.openai.json");
    let externalTree: Awaited<ReturnType<typeof snapshotTree>> | undefined;
    const { result, notifications } = await run(h, ["Edit", "openai", SAVE_OPTION, async () => {
      const external = await readJson(changedPath);
      if (target === "profile") external.orchestrator.thinking = "low";
      else external.defaultProfile = "grok";
      await writeJson(changedPath, external);
      externalTree = await snapshotTree(h.root);
      return true;
    }]);
    assert.deepEqual(result, { wrote: false, cancelled: false }, target);
    assert.match(notifications.at(-1)?.message ?? "", /changed.*reopen/i, target);
    assert.equal(notifications.at(-1)?.type, "error");
    assert.deepEqual(await snapshotTree(h.root), externalTree, target);
  }
});

test("create rejects unsafe, reserved, duplicate, overwrite, and traversal names without writing", async () => {
  const h = await createEditorHarness();
  await writeJson(join(h.gentleDir, "models.orphan.json"), profile("orphan", "high"));
  const before = await snapshotTree(h.root);
  for (const name of ["edit", "Edit", "status", "openai", "Orphan", "../etc", "bad name", "orphan"]) {
    const { result, notifications } = await run(h, ["Create", name]);
    assert.equal(result.wrote, false, name);
    assert.equal(notifications.at(-1)?.type, "error", name);
    assert.deepEqual(await snapshotTree(h.root), before, name);
  }
});

test("assignments absent from live availability must be replaced before save and are never invented", async () => {
  const h = await createEditorHarness({
    catalog: catalogFor(["xai"], [catalogEntry("acme", "replacement", "Replacement")]),
  });
  const before = await snapshotTree(h.root);
  const blocked = await run(h, [
    "Edit",
    "openai",
    SAVE_OPTION,
    undefined,
  ]);
  assert.equal(blocked.result.wrote, false);
  assert.match(blocked.notifications.some((item) => /orchestrator|gentle-ai-explore|review-risk/.test(item.message) && /unavailable|unsupported/i.test(item.message)) ? "ok" : "", /ok/);
  assert.deepEqual(await snapshotTree(h.root), before);

  const replacement = modelChoice(catalogEntry("acme", "replacement", "Replacement"));
  const saved = await run(h, [
    "Edit",
    "openai",
    (title, options) => options?.find((option) => option.startsWith("orchestrator:")) ?? "",
    replacement,
    "medium",
    (title, options) => options?.find((option) => option.startsWith("gentle-ai-explore:")) ?? "",
    replacement,
    "medium",
    (title, options) => options?.find((option) => option.startsWith("review-risk:")) ?? "",
    replacement,
    "medium",
    SAVE_OPTION,
    true,
  ]);
  assert.equal(saved.result.wrote, true);
  const next = await readJson(join(h.gentleDir, "models.openai.json"));
  assert.ok(Object.values(next).every((entry: any) => entry.model === "acme/replacement"));
  assert.equal(next.orchestrator.thinking, "medium");
  assert.deepEqual(THINKING_LEVELS.includes("medium"), true);
});

test("live choices work without a catalog, preserve custom identities, and omit SDK secrets", async () => {
  const h = await createEditorHarness({ omitCatalog: true });
  const live = catalogFor(["openai-codex", "xai"], [catalogEntry("custom", "nested/id", "Custom")]).models;
  const beforeCanonical = await readFile(h.canonicalPath, "utf8");
  const script = scriptedUi([
    "Edit", "openai",
    (_title, options) => options?.find((value) => value.startsWith("orchestrator:")),
    (_title, options) => {
      assert.deepEqual(new Set(options), new Set(live.map(modelChoice)));
      return "custom/nested/id — Custom";
    },
    "low", SAVE_OPTION, true,
  ]);
  const result = await runProfileEditor(script.ui, h, undefined, {
    getAvailable: () => live.map((model) => ({ ...model, apiKey: "secret-sentinel", headers: { authorization: "secret-sentinel" } })),
  });
  assert.equal(result.wrote, true);
  const bytes = await readFile(join(h.gentleDir, "models.openai.json"), "utf8");
  assert.doesNotMatch(bytes, /secret-sentinel|headers|reasoning/);
  assert.deepEqual(JSON.parse(bytes).orchestrator, { model: "custom/nested/id", thinking: "low" });
  assert.equal(await readFile(h.canonicalPath, "utf8"), beforeCanonical);
});

test("missing, empty, throwing and rejected registry block mutation even with a stale catalog", async () => {
  for (const registry of [undefined, { getAvailable: () => [] }, { getAvailable: () => { throw new Error("private detail"); } }, { getAvailable: async () => { throw new Error("private detail"); } }]) {
    for (const action of ["Edit", "Create"]) {
      const h = await createEditorHarness();
      const before = await snapshotTree(h.root);
      const script = scriptedUi([action]);
      assert.equal((await runProfileEditor(script.ui, h, undefined, registry)).wrote, false);
      assert.match(script.notifications.at(-1)?.message ?? "", /live.*registry/i);
      assert.doesNotMatch(script.notifications.at(-1)?.message ?? "", /private detail/);
      assert.deepEqual(await snapshotTree(h.root), before);
    }
  }
});

test("async live create ignores stale catalog and View never queries availability", async () => {
  const h = await createEditorHarness({ catalog: { invalid: true } });
  const live = catalogFor(["openai-codex", "xai"]).models;
  const script = scriptedUi(["Create", "local", "grok", SAVE_OPTION, true]);
  assert.equal((await runProfileEditor(script.ui, h, undefined, { getAvailable: async () => live })).wrote, true);
  const view = scriptedUi(["View", "local"]);
  assert.equal((await runProfileEditor(view.ui, h, undefined, { getAvailable: () => { throw new Error("must not query"); } })).wrote, false);
  assert.match(view.notifications.at(-1)?.message ?? "", /Profile: local/);
});

test("model-specific thinking preserves unsupported effort visibly until explicit replacement", async () => {
  const h = await createEditorHarness();
  const live = catalogFor(["openai-codex", "xai"]).models;
  const replacement = { provider: "custom", id: "plain", name: "Plain", reasoning: false };
  const before = await snapshotTree(h.root);
  const script = scriptedUi([
    "Edit", "openai",
    (_title, options) => options?.find((value) => value.startsWith("orchestrator:")),
    "custom/plain — Plain",
    (_title, options) => {
      assert.deepEqual(options, ["high [unsupported; preserve]", "off"]);
      return options?.[0];
    },
    (_title, options) => {
      assert.ok(options?.some((value) => /orchestrator: custom\/plain \(high\).*unsupported/.test(value)));
      return SAVE_OPTION;
    },
    undefined,
  ]);
  const result = await runProfileEditor(script.ui, h, undefined, { getAvailable: () => [...live, replacement] });
  assert.equal(result.wrote, false);
  assert.match(script.notifications.at(-1)?.message ?? "", /unsupported/);
  assert.deepEqual(await snapshotTree(h.root), before);
});

test("thinking options require capability evidence and preserve model-specific levels", () => {
  const reasoning = { provider: "custom", id: "model", name: "Model", reasoning: true };
  const options = (raw: unknown) => supportedThinking(normalizeAvailableModels([raw])[0]);
  assert.deepEqual(options(reasoning), ["low", "medium", "high"]);
  assert.deepEqual(options({ ...reasoning, reasoning: false }), ["off"]);
  assert.deepEqual(options({ provider: "custom", id: "unknown" }), ["off"]);
  assert.deepEqual(options({ ...reasoning, thinkingLevelMap: { low: null, high: null, xhigh: "extreme", max: 32768, deep: "custom" } }), ["medium", "xhigh", "max", "deep"]);
  assert.deepEqual(options({ ...reasoning, thinkingLevelMap: { off: "none", minimal: 0, xhigh: null, max: undefined, deep: {} } }), ["off", "minimal", "low", "medium", "high"]);
  const inherited = Object.create({ max: "max", deep: "deep" });
  inherited.medium = null;
  assert.deepEqual(options({ ...reasoning, thinkingLevelMap: inherited }), ["low", "high"]);
  assert.deepEqual(options({ ...reasoning, reasoning: false, thinkingLevelMap: { max: "max" } }), ["off"]);
});

test("normalized metadata is detached, allowlisted, and rejects malformed live identities", () => {
  const raw = { provider: "custom", id: "nested/model", name: "Custom", reasoning: true,
    thinkingLevelMap: { max: "max", high: null }, headers: { authorization: "sentinel" }, apiKey: "sentinel" };
  const normalized = normalizeAvailableModels([raw])[0];
  assert.deepEqual(Object.keys(normalized).sort(), ["provider", "id", "model", "name", "reasoning", "thinkingLevelMap"].sort());
  assert.equal(normalized.model, "custom/nested/model");
  raw.thinkingLevelMap.max = "changed";
  assert.equal(normalized.thinkingLevelMap?.max, "max");
  for (const value of [[], null, [{ provider: "bad/provider", id: "model" }], [{ provider: "bad provider", id: "model" }], [{ provider: "custom", id: "bad model" }], [raw, raw]]) {
    assert.throws(() => normalizeAvailableModels(value));
  }
});

test("registry error state blocks mutation without reading available models or exposing details", async () => {
  const h = await createEditorHarness();
  const before = await snapshotTree(h.root);
  const script = scriptedUi(["Edit"]);
  const result = await runProfileEditor(script.ui, h, undefined, {
    getError: () => "private sentinel",
    getAvailable: () => { throw new Error("must not read"); },
  });
  assert.equal(result.wrote, false);
  assert.doesNotMatch(script.notifications.at(-1)?.message ?? "", /private sentinel|must not read/);
  assert.deepEqual(await snapshotTree(h.root), before);
});

test("existing model-specific effort saves only with explicit live support", async () => {
  const h = await createEditorHarness({ omitCatalog: true });
  await writeJson(join(h.gentleDir, "models.openai.json"), profile("openai-codex", "deep"));
  const live = catalogFor(["openai-codex", "xai"]).models.map((model) => ({ ...model, thinkingLevelMap: { deep: "provider-value" } }));
  const valid = scriptedUi(["Edit", "openai", SAVE_OPTION, true]);
  assert.equal((await runProfileEditor(valid.ui, h, undefined, { getAvailable: () => live })).wrote, true);
  assert.equal((await readJson(join(h.gentleDir, "models.openai.json"))).orchestrator.thinking, "deep");
  const before = await snapshotTree(h.root);
  const invalid = scriptedUi(["Edit", "openai", SAVE_OPTION, undefined]);
  assert.equal((await runProfileEditor(invalid.ui, h, undefined, { getAvailable: () => live.map(({ thinkingLevelMap, ...model }) => model) })).wrote, false);
  assert.match(invalid.notifications.at(-1)?.message ?? "", /unsupported.*orchestrator/);
  assert.deepEqual(await snapshotTree(h.root), before);
});

test("unsupported thinking needs explicit replacement, then save succeeds", async () => {
  const h = await createEditorHarness();
  const live = catalogFor(["openai-codex", "xai"]).models;
  const plain = { provider: "custom", id: "plain", name: "Plain", reasoning: false };
  const chooseAgent = (_title: string, options?: string[]) => options?.find((value) => value.startsWith("orchestrator:"));
  const script = scriptedUi([
    "Edit", "openai", chooseAgent, "custom/plain — Plain", "high [unsupported; preserve]",
    SAVE_OPTION, chooseAgent, "custom/plain — Plain", "off", SAVE_OPTION, true,
  ]);
  assert.equal((await runProfileEditor(script.ui, h, undefined, { getAvailable: () => [...live, plain] })).wrote, true);
  assert.deepEqual((await readJson(join(h.gentleDir, "models.openai.json"))).orchestrator, { model: "custom/plain", thinking: "off" });
});

test("persistence failure after writing the new profile rolls the profile file back", async () => {
  const h = await createEditorHarness();
  const before = await snapshotTree(h.root);
  let writes = 0;
  const io: ProfileEditorIO = {
    writeFile: async (path, content) => {
      writes += 1;
      if (writes === 1) {
        await writeFile(path, content, "utf8");
        return;
      }
      throw new Error("manifest write failed");
    },
  };
  const { result, notifications } = await run(h, ["Create", "local", "openai", SAVE_OPTION, true], io);
  assert.equal(result.wrote, false);
  assert.match(notifications.at(-1)?.message ?? "", /manifest write failed|roll/i);
  assert.equal(await readFile(h.manifestPath, "utf8"), before.find((item) => item.path === "gentle-ai/model-profiles.manifest.json")?.content);
  assert.equal(await stat(join(h.gentleDir, "models.local.json")).then(() => "present", () => "missing"), "missing");
  assert.equal(await readFile(h.canonicalPath, "utf8"), before.find((item) => item.path === "gentle-ai/models.json")?.content);
  assert.equal(await readFile(join(h.gentleDir, "models.openai.json"), "utf8"), before.find((item) => item.path === "gentle-ai/models.openai.json")?.content);
});
