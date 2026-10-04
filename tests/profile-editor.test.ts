import assert from "node:assert/strict";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import test from "node:test";

import { buildModelCatalog, type CatalogModel } from "../extensions/model-profiles/catalog.ts";
import {
  agentChoice,
  modelChoice,
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
  }, io);
  return { ...script, result };
}

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

test("edit and create require a valid catalog and explain how to generate one", async () => {
  for (const action of ["Edit", "Create"]) {
    const h = await createEditorHarness({ omitCatalog: true });
    const before = await snapshotTree(h.root);
    const { result, notifications } = await run(h, [action]);
    assert.equal(result.wrote, false);
    assert.match(notifications.at(-1)?.message ?? "", /npm run export:model-catalog/);
    assert.match(notifications.at(-1)?.message ?? "", /model-catalog\.json/);
    assert.deepEqual(await snapshotTree(h.root), before);
  }

  const invalid = await createEditorHarness({ catalog: { schemaVersion: 1 } });
  const beforeInvalid = await snapshotTree(invalid.root);
  const viewed = await run(invalid, ["View", "grok"]);
  assert.equal(viewed.result.wrote, false);
  assert.match(viewed.notifications.at(-1)?.message ?? "", /Profile: grok/);
  const edited = await run(invalid, ["Edit"]);
  assert.equal(edited.result.wrote, false);
  assert.match(edited.notifications.at(-1)?.message ?? "", /catalog/i);
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

test("edit saves catalog selections into the named profile without applying the active profile", async () => {
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

test("assignments absent from the catalog must be replaced before save and are never invented", async () => {
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
  assert.match(blocked.notifications.some((item) => /orchestrator|gentle-ai-explore|review-risk/.test(item.message) && /catalog|replacement/i.test(item.message)) ? "ok" : "", /ok/);
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
