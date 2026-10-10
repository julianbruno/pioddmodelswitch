import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import test from "node:test";

import oddModelProfiles, { balanceProgress } from "../extensions/odd-model-profiles.ts";
import { RETIRED_MANAGED_AGENTS } from "../extensions/model-profiles/core.ts";
import { inspectModelProfileTransactions } from "../extensions/model-profiles/transaction.ts";

type RegisteredCommand = {
  description: string;
  getArgumentCompletions?: (prefix: string) => Array<{ value: string; label?: string }> | null;
  handler: (args: string, ctx: FakeCommandContext) => Promise<void> | void;
};

type FakeCommandContext = {
  cwd: string;
  ui: {
    notify(message: string, level: string): void;
    select?(title: string, options: string[]): Promise<string | undefined>;
    confirm?(title: string, message: string): Promise<boolean>;
    input?(title: string, placeholder?: string): Promise<string | undefined>;
  };
  reload(): Promise<void>;
  model?: { provider: string; id: string };
  scopedModels?: unknown[];
  modelRegistry: { find(provider: string, id: string): unknown; getAvailable?(): unknown; getError?(): string | undefined };
};

for (const mode of ["success", "cancel", "error"]) test(`Balance loader ${mode} disposes UI and listeners`, async () => {
  let loader: any;
  let disposed = 0, removed = 0, doneCount = 0;
  class FakeLoader {
    controller = new AbortController();
    signal = this.controller.signal;
    onAbort?: () => void;
    constructor() {
      loader = this;
      const remove = this.signal.removeEventListener.bind(this.signal);
      this.signal.removeEventListener = (...args) => { removed++; return remove(...args); };
    }
    dispose() { disposed++; }
  }
  const ui = { custom: (factory: any) => new Promise(resolve => {
    const component = factory({}, {}, {}, (value: unknown) => {
      doneCount++;
      component.dispose();
      resolve(value);
    });
  }) };
  let signal: AbortSignal | undefined;
  const pending = balanceProgress(ui as any, async current => {
    signal = current;
    if (mode === "error") throw new Error("provider");
    if (mode === "cancel") {
      return new Promise((_resolve, reject) => current.addEventListener("abort", () => reject(new Error("cancelled")), { once: true }));
    }
    return "proposal";
  }, async () => FakeLoader as any);
  // Let the loader and work begin, then exercise its actual cancellation hook.
  await Promise.resolve();
  await Promise.resolve();
  if (mode === "cancel") loader.onAbort();
  if (mode === "success") assert.equal(await pending, "proposal");
  else await assert.rejects(pending, mode === "cancel" ? /cancelled/ : /provider/);
  assert.equal(doneCount, 1);
  assert.equal(disposed, 1);
  assert.equal(removed, 1);
  assert.equal(loader.onAbort, undefined);
  assert.equal(signal?.aborted, true);
});

const normalAgents = ["orchestrator", "gentle-ai-explore", "gentle-ai-verify", "jd-fix-agent", "gentle-ai-worker"];
const judgeAgents = ["review-risk", "review-resilience", "review-readability", "review-reliability", "jd-judge-a", "jd-judge-b"];
const agents = [...normalAgents, ...judgeAgents];

function profile(modelPrefix: string, effort = "high"): Record<string, { model: string; thinking: string }> {
  return Object.fromEntries(agents.map((agent) => [agent, { model: `${modelPrefix}/${agent}`, thinking: effort }]));
}

function selectedProfile(activePrefix: string, activeEffort: string, oppositePrefix: string, oppositeEffort: string): Record<string, { model: string; thinking: string }> {
  return Object.fromEntries([
    ...normalAgents.map((agent) => [agent, { model: `${activePrefix}/${agent}`, thinking: activeEffort }]),
    ...judgeAgents.map((agent) => [agent, { model: `${oppositePrefix}/${agent}`, thinking: oppositeEffort }]),
  ]);
}

function selectedRuntime(activePrefix: string, activeEffort: string, oppositePrefix: string, oppositeEffort: string): Record<string, { model: string; effort: string }> {
  return Object.fromEntries([
    ...normalAgents.map((agent) => [agent, { model: `${activePrefix}/${agent}`, effort: activeEffort }]),
    ...judgeAgents.map((agent) => [agent, { model: `${oppositePrefix}/${agent}`, effort: oppositeEffort }]),
  ]);
}

async function readJson(path: string): Promise<any> {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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
    const entries = await readdir(path, { withFileTypes: true });
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      await walk(join(path, entry.name));
    }
  }
  await walk(root);
  return records;
}

async function createHarness() {
  const root = await mkdir(join(tmpdir(), `odd-model-profiles-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`), { recursive: true });
  const piHome = root;
  const gentleDir = join(piHome, "gentle-ai");
  const agentDir = join(piHome, "agent");
  await mkdir(gentleDir, { recursive: true });
  await mkdir(agentDir, { recursive: true });

  const manifest = {
    schemaVersion: 2,
    defaultProfile: "openai",
    managedAgentGroups: { odd: ["orchestrator", "gentle-ai-explore", "gentle-ai-verify", "jd-fix-agent", "gentle-ai-worker"] },
    reservedCommandNames: ["status", "list", "preview", "doctor", "undo", "recover"],
    oppositeProviderJudges: {
      enabled: true,
      agents: judgeAgents,
      profilePairs: { openai: "grok", grok: "openai" },
    },
    profiles: [
      { name: "openai", modelsFile: "models.openai.json" },
      { name: "grok", modelsFile: "models.grok.json" },
      { name: "local", modelsFile: "models.local.json" },
    ],
  };

  await writeJson(join(gentleDir, "model-profiles.manifest.json"), manifest);
  await writeJson(join(gentleDir, "models.openai.json"), profile("openai-codex", "high"));
  await writeJson(join(gentleDir, "models.grok.json"), profile("xai", "xhigh"));
  await writeJson(join(gentleDir, "models.local.json"), profile("local", "medium"));
  await writeJson(join(gentleDir, "models.json"), { ...selectedProfile("openai-codex", "high", "xai", "xhigh"), unmanagedCanonical: { model: "keep/me", thinking: "low" } });
  await writeJson(join(agentDir, "subagents.json"), {
    model_profiles: {
      ...selectedRuntime("openai-codex", "high", "xai", "xhigh"),
      unrelatedAgent: { model: "keep/runtime", effort: "low" },
    },
    unrelatedTopLevel: true,
  });

  const commands = new Map<string, RegisteredCommand>();
  let current = { provider: "openai-codex", id: "orchestrator" };
  let thinking = "high";
  const modelCalls: string[] = [];
  const thinkingCalls: string[] = [];
  const pi = {
    registerCommand: (name: string, command: RegisteredCommand) => commands.set(name, command),
    setModel: async (model: { provider: string; id: string }) => { modelCalls.push(`${model.provider}/${model.id}`); current = model; thinking = "low"; return true; },
    getThinkingLevel: () => thinking,
    setThinkingLevel: (level: string) => { thinkingCalls.push(level); thinking = level; },
  };
  oddModelProfiles(pi as any, { piHome });
  const command = commands.get("jb-odd-models");
  assert.ok(command);

  const notifications: Array<{ message: string; level: string }> = [];
  let reloadCount = 0;
  const ctx: FakeCommandContext = {
    cwd: root,
    get model() { return current; },
    modelRegistry: { find: (provider, id) => ({ provider, id }) },
    ui: { notify: (message, level) => notifications.push({ message, level }) },
    reload: async () => { reloadCount += 1; },
  };

  return {
    root,
    gentleDir,
    runtimePath: join(agentDir, "subagents.json"),
    canonicalPath: join(gentleDir, "models.json"),
    journalDir: join(gentleDir, ".model-profiles-transactions"),
    command,
    ctx,
    notifications,
    reloadCount: () => reloadCount,
    modelCalls,
    thinkingCalls,
    session: () => ({ model: current, thinking }),
    pi,
  };
}

test("status separates shared persisted sources from the invoking live orchestrator", async () => {
  const h = await createHarness();
  await h.pi.setModel({ provider: "local", id: "orchestrator" });
  h.pi.setThinkingLevel("medium");
  const runtime = await readJson(h.runtimePath);
  runtime.model_profiles.orchestrator = { model: "xai/orchestrator", effort: "xhigh" };
  await writeJson(h.runtimePath, runtime);
  const before = await snapshotTree(h.root);
  for (const action of ["", "status"]) {
    await h.command.handler(action, h.ctx);
    const text = h.notifications.at(-1)!.message;
    assert.match(text, /Scope: shared persisted configuration/);
    assert.ok(text.includes(`Canonical source: ${h.canonicalPath}`));
    assert.ok(text.includes(`Runtime source: ${h.runtimePath}`));
    assert.match(text, /orchestrator: openai-codex\/orchestrator \(high\).*runtime xai\/orchestrator \(xhigh\).*\[misaligned\]/);
    assert.match(text, /Invoking live orchestrator: local\/orchestrator \(medium\)/);
    assert.match(text, /Live vs canonical: mismatch; live vs runtime: mismatch/);
    assert.match(text, /Other sessions are not observed; refresh timing is not guaranteed/);
  }
  assert.deepEqual(await snapshotTree(h.root), before);
  assert.equal(h.reloadCount(), 0);
});

test("status keeps live evidence when saved state or live model is unavailable", async () => {
  const h = await createHarness();
  await writeFile(h.canonicalPath, "{invalid");
  await h.command.handler("status", h.ctx);
  assert.match(h.notifications.at(-1)!.message, /Persisted ODD profile: unknown/);
  assert.match(h.notifications.at(-1)!.message, /Invoking live orchestrator: openai-codex\/orchestrator \(high\)/);
  Object.defineProperty(h.ctx, "model", { value: undefined });
  await h.command.handler("", h.ctx);
  assert.match(h.notifications.at(-1)!.message, /Invoking live orchestrator: unavailable \(thinking high\)/);
  assert.match(h.notifications.at(-1)!.message, /Live vs canonical: unknown; live vs runtime: unknown/);
});

test("status detects thinking-only mismatch and reports aligned or unavailable live evidence", async () => {
  const h = await createHarness();
  const before = await snapshotTree(h.root);
  await h.command.handler("status", h.ctx);
  assert.match(h.notifications.at(-1)!.message, /Live vs canonical: match; live vs runtime: match/);
  h.pi.setThinkingLevel("medium");
  await h.command.handler("status", h.ctx);
  assert.match(h.notifications.at(-1)!.message, /Live vs canonical: mismatch; live vs runtime: mismatch/);
  Object.defineProperty(h.ctx, "model", { value: undefined });
  await h.command.handler("status", h.ctx);
  assert.match(h.notifications.at(-1)!.message, /Persisted ODD profile: openai/);
  assert.match(h.notifications.at(-1)!.message, /Live vs canonical: unknown; live vs runtime: unknown/);
  assert.deepEqual(await snapshotTree(h.root), before);
});

test("switch notices distinguish shared changes, caller reload, and file no-op", async () => {
  const h = await createHarness();
  await h.command.handler("local", h.ctx);
  const changed = h.notifications.at(-1)!.message;
  assert.ok(changed.includes(`Shared files changed: ${h.canonicalPath}; ${h.runtimePath}`));
  assert.match(changed, /Only the invoking session reloads/);
  await h.pi.setModel({ provider: "openai-codex", id: "orchestrator" });
  h.pi.setThinkingLevel("high");
  await h.command.handler("local", h.ctx);
  assert.match(h.notifications.at(-1)!.message, /shared files unchanged; invoking live orchestrator aligned; no reload needed/);
  assert.equal(h.reloadCount(), 1);
});

test("direct selection aligns the session, including file no-op and complete no-op", async () => {
  const h = await createHarness();
  await h.command.handler("local", h.ctx);
  assert.deepEqual(h.session(), { model: { provider: "local", id: "orchestrator" }, thinking: "medium" });
  assert.deepEqual(h.modelCalls, ["local/orchestrator"]);
  const before = await snapshotTree(h.root);
  await h.command.handler("local", h.ctx);
  assert.deepEqual(await snapshotTree(h.root), before);
  assert.equal(h.modelCalls.length, 1);
  assert.deepEqual(h.thinkingCalls, ["medium"]);
  assert.equal(h.reloadCount(), 1);
  await h.pi.setModel({ provider: "openai-codex", id: "orchestrator" });
  h.pi.setThinkingLevel("high");
  const calls = h.modelCalls.length;
  await h.command.handler("local", h.ctx);
  assert.deepEqual(h.session(), { model: { provider: "local", id: "orchestrator" }, thinking: "medium" });
  assert.equal(h.modelCalls.length, calls + 1);
  assert.deepEqual(await snapshotTree(h.root), before);
  assert.equal(h.reloadCount(), 1);
});

test("session preflight and alignment failures leave files, mtimes, and reload unchanged", async () => {
  for (const failure of ["no-current", "missing-model", "no-auth", "throw", "clamp"]) {
    const h = await createHarness();
    const before = await snapshotTree(h.root);
    if (failure === "no-current") Object.defineProperty(h.ctx, "model", { value: undefined });
    if (failure === "missing-model") h.ctx.modelRegistry.find = () => undefined;
    if (failure === "no-auth") h.pi.setModel = async (model: { provider: string; id: string }) => { h.modelCalls.push(`${model.provider}/${model.id}`); return false; };
    if (failure === "throw") h.pi.setModel = async (model: { provider: string; id: string }) => { h.modelCalls.push(`${model.provider}/${model.id}`); throw new Error("model failure"); };
    if (failure === "clamp") {
      const setThinking = h.pi.setThinkingLevel;
      h.pi.setThinkingLevel = (level: string) => { if (level === "medium") { h.thinkingCalls.push(level); return; } setThinking(level); };
    }
    await h.command.handler("local", h.ctx);
    assert.equal(h.notifications.at(-1)?.level, "error", failure);
    assert.deepEqual(await snapshotTree(h.root), before, failure);
    assert.equal(h.reloadCount(), 0, failure);
    if (failure === "no-auth" || failure === "throw") {
      assert.deepEqual(h.session(), { model: { provider: "openai-codex", id: "orchestrator" }, thinking: "high" });
      assert.deepEqual(h.thinkingCalls, []);
      assert.deepEqual(h.modelCalls, ["local/orchestrator"]);
    }
    if (failure === "clamp") {
      assert.deepEqual(h.modelCalls, ["local/orchestrator", "openai-codex/orchestrator"]);
      assert.deepEqual(h.session(), { model: { provider: "openai-codex", id: "orchestrator" }, thinking: "high" });
    }
  }
});

test("reload failure keeps switched files and aligned session without compensation", async () => {
  const h = await createHarness();
  let reloads = 0;
  h.ctx.reload = async () => { reloads++; throw new Error("reload unavailable"); };
  await h.command.handler("local", h.ctx);
  assert.equal(reloads, 1);
  assert.deepEqual(h.session(), { model: { provider: "local", id: "orchestrator" }, thinking: "medium" });
  assert.deepEqual(h.modelCalls, ["local/orchestrator"]);
  assert.deepEqual(h.thinkingCalls, ["medium"]);
  assert.deepEqual((await readJson(h.canonicalPath)).orchestrator, { model: "local/orchestrator", thinking: "medium" });
  assert.deepEqual((await readJson(h.runtimePath)).model_profiles.orchestrator, { model: "local/orchestrator", effort: "medium" });
  assert.equal(h.notifications.at(-1)?.level, "error");
  assert.match(h.notifications.at(-1)?.message ?? "", /reload unavailable.*shared persisted state remains applied.*invoking live orchestrator remains aligned.*\/reload manually or restart Pi/s);
});

test("model change reapplies thinking even when target equals previous thinking", async () => {
  const h = await createHarness();
  const local = profile("local", "medium");
  local.orchestrator.thinking = "high";
  await writeJson(join(h.gentleDir, "models.local.json"), local);
  await h.command.handler("local", h.ctx);
  assert.equal(h.session().thinking, "high");
  assert.deepEqual(h.thinkingCalls, ["high"]);
});

test("nonstandard orchestrator thinking aborts before any model call or file mutation", async () => {
  const h = await createHarness();
  const local = profile("local", "medium");
  local.orchestrator.thinking = "Provider.Custom-v2";
  await writeJson(join(h.gentleDir, "models.local.json"), local);
  const before = await snapshotTree(h.root);
  await h.command.handler("local", h.ctx);
  assert.match(h.notifications.at(-1)?.message ?? "", /not a standard Pi thinking level/);
  assert.deepEqual(h.modelCalls, []);
  assert.deepEqual(h.thinkingCalls, []);
  assert.deepEqual(await snapshotTree(h.root), before);
  assert.equal(h.reloadCount(), 0);
});

test("max is an applicable standard Pi thinking level", async () => {
  const h = await createHarness();
  const local = profile("local", "medium");
  local.orchestrator.thinking = "max";
  await writeJson(join(h.gentleDir, "models.local.json"), local);
  await h.command.handler("local", h.ctx);
  assert.deepEqual(h.session(), { model: { provider: "local", id: "orchestrator" }, thinking: "max" });
  assert.equal(h.reloadCount(), 1);
});

test("file switch failure restores session and reports failed restoration", async () => {
  for (const failedRestore of [false, true]) {
    const h = await createHarness();
    const before = await snapshotTree(h.root);
    const setModel = h.pi.setModel;
    if (failedRestore) h.pi.setModel = async (model: { provider: string; id: string }) => model.provider === "openai-codex" ? false : setModel(model);
    // Existing transaction hazard makes switchProfile fail after session alignment.
    await mkdir(h.journalDir, { recursive: true });
    await writeFile(join(h.journalDir, "lock.json"), "invalid lock");
    await h.command.handler("local", h.ctx);
    assert.equal(h.reloadCount(), 0);
    assert.match(h.notifications.at(-1)?.message ?? "", failedRestore ? /session restoration failed/ : /original session restored/);
    if (!failedRestore) assert.deepEqual(h.session(), { model: { provider: "openai-codex", id: "orchestrator" }, thinking: "high" });
    assert.deepEqual(h.thinkingCalls, ["medium", "high"]);
    assert.match(h.notifications.at(-1)?.message ?? "", /lock/);
    assert.equal(await readFile(h.canonicalPath, "utf8"), before.find((item) => item.path === "gentle-ai/models.json")?.content);
    assert.equal(await readFile(h.runtimePath, "utf8"), before.find((item) => item.path === "agent/subagents.json")?.content);
    assert.equal((await stat(h.canonicalPath)).mtimeMs, before.find((item) => item.path === "gentle-ai/models.json")?.mtimeMs);
    assert.equal((await stat(h.runtimePath)).mtimeMs, before.find((item) => item.path === "agent/subagents.json")?.mtimeMs);
  }
});

test("registered command uses manifest profiles for completion, list, preview, and direct switching", async () => {
  const harness = await createHarness();

  assert.deepEqual(harness.command.getArgumentCompletions?.("l")?.map((item) => item.value), ["list", "local"]);
  assert.deepEqual(harness.command.getArgumentCompletions?.("preview l")?.map((item) => item.value), ["preview local"]);
  assert.deepEqual(harness.command.getArgumentCompletions?.("preview ")?.map((item) => item.value), ["preview openai", "preview grok", "preview local"]);

  await harness.command.handler("list", harness.ctx);
  assert.match(harness.notifications.at(-1)?.message ?? "", /local/);
  assert.equal(harness.reloadCount(), 0);

  const beforePreviewCanonical = await readFile(harness.canonicalPath, "utf8");
  const beforePreviewRuntime = await readFile(harness.runtimePath, "utf8");
  await harness.command.handler("preview local", harness.ctx);
  assert.match(harness.notifications.at(-1)?.message ?? "", /Preview ODD profile: local/);
  assert.match(harness.notifications.at(-1)?.message ?? "", /jd-fix-agent/);
  assert.match(harness.notifications.at(-1)?.message ?? "", /canonical .*openai-codex\/jd-fix-agent.* -> .*local\/jd-fix-agent/s);
  assert.match(harness.notifications.at(-1)?.message ?? "", /runtime .*openai-codex\/jd-fix-agent.* -> .*local\/jd-fix-agent/s);
  assert.equal(await readFile(harness.canonicalPath, "utf8"), beforePreviewCanonical);
  assert.equal(await readFile(harness.runtimePath, "utf8"), beforePreviewRuntime);
  assert.equal(harness.reloadCount(), 0);

  await harness.command.handler("local", harness.ctx);
  assert.equal(harness.reloadCount(), 1);
  const canonical = await readJson(harness.canonicalPath);
  const runtime = await readJson(harness.runtimePath);
  assert.deepEqual(canonical.unmanagedCanonical, { model: "keep/me", thinking: "low" });
  assert.deepEqual(runtime.model_profiles.unrelatedAgent, { model: "keep/runtime", effort: "low" });
  assert.equal(runtime.unrelatedTopLevel, true);
  assert.deepEqual(canonical["jd-fix-agent"], { model: "local/jd-fix-agent", thinking: "medium" });
  assert.deepEqual(runtime.model_profiles["jd-fix-agent"], { model: "local/jd-fix-agent", effort: "medium" });
});

test("preview, switch, and active state preserve unrestricted effort strings exactly", async () => {
  for (const effort of ["Provider.Custom-v2", "custom effort"]) {
    const harness = await createHarness();
    await writeJson(join(harness.gentleDir, "models.local.json"), profile("local", effort));
    const beforePreview = await snapshotTree(harness.root);

    await harness.command.handler("preview local", harness.ctx);
    const preview = harness.notifications.at(-1)?.message ?? "";
    assert.ok(preview.includes(`gentle-ai-explore: canonical openai-codex/gentle-ai-explore (high) -> local/gentle-ai-explore (${effort})`));
    assert.ok(preview.includes(`runtime openai-codex/gentle-ai-explore (high) -> local/gentle-ai-explore (${effort})`));
    assert.deepEqual(await snapshotTree(harness.root), beforePreview);
    assert.equal(harness.reloadCount(), 0);

    await harness.command.handler("local", harness.ctx);
    assert.equal(harness.reloadCount(), 0);
    assert.match(harness.notifications.at(-1)?.message ?? "", /standard Pi thinking level/);
    assert.deepEqual(await snapshotTree(harness.root), beforePreview);
    await harness.command.handler("status", harness.ctx);
    await harness.command.handler("doctor", harness.ctx);
    assert.deepEqual(await snapshotTree(harness.root), beforePreview);
  }
});

test("invalid canonical and runtime effort values fail closed without rewriting active files", async () => {
  for (const source of ["canonical", "runtime"] as const) {
    for (const effort of ["", " ", "\t\n", " max", "max ", 0, false, null, [], {}, undefined]) {
      const harness = await createHarness();
      const path = source === "canonical" ? harness.canonicalPath : harness.runtimePath;
      const state = await readJson(path);
      const entry = source === "canonical" ? state["gentle-ai-explore"] : state.model_profiles["gentle-ai-explore"];
      entry[source === "canonical" ? "thinking" : "effort"] = effort;
      await writeJson(path, state);
      const beforeCanonical = await readFile(harness.canonicalPath, "utf8");
      const beforeRuntime = await readFile(harness.runtimePath, "utf8");

      for (const action of ["status", "preview local", "local"]) {
        await harness.command.handler(action, harness.ctx);
        assert.match(harness.notifications.at(-1)?.message ?? "", /(?:thinking|effort) must be a non-empty, trimmed string|missing: (?:thinking|effort)/);
        assert.equal(harness.reloadCount(), 0);
        assert.equal(await readFile(harness.canonicalPath, "utf8"), beforeCanonical);
        assert.equal(await readFile(harness.runtimePath, "utf8"), beforeRuntime);
      }
    }
  }
});

test("status, preview, and switch use opposite-provider mappings for configured judges", async () => {
  const harness = await createHarness();

  await harness.command.handler("status", harness.ctx);
  assert.match(harness.notifications.at(-1)?.message ?? "", /Persisted ODD profile: openai/);
  assert.match(harness.notifications.at(-1)?.message ?? "", /review-risk: xai\/review-risk \(xhigh\)/);

  await harness.command.handler("preview grok", harness.ctx);
  assert.match(harness.notifications.at(-1)?.message ?? "", /gentle-ai-explore: canonical .*openai-codex\/gentle-ai-explore.* -> .*xai\/gentle-ai-explore/s);
  assert.match(harness.notifications.at(-1)?.message ?? "", /review-risk: canonical .*xai\/review-risk.* -> .*openai-codex\/review-risk/s);

  await harness.command.handler("grok", harness.ctx);
  assert.equal(harness.reloadCount(), 1);
  const canonical = await readJson(harness.canonicalPath);
  const runtime = await readJson(harness.runtimePath);
  assert.deepEqual(canonical["gentle-ai-explore"], { model: "xai/gentle-ai-explore", thinking: "xhigh" });
  assert.deepEqual(runtime.model_profiles["gentle-ai-explore"], { model: "xai/gentle-ai-explore", effort: "xhigh" });
  assert.deepEqual(canonical["review-risk"], { model: "openai-codex/review-risk", thinking: "high" });
  assert.deepEqual(runtime.model_profiles["review-risk"], { model: "openai-codex/review-risk", effort: "high" });

  await harness.command.handler("status", harness.ctx);
  assert.match(harness.notifications.at(-1)?.message ?? "", /Persisted ODD profile: grok/);
});

test("fresh aligned switch leaves complete fixture tree unchanged with no history", async () => {
  const harness = await createHarness();
  const before = await snapshotTree(harness.root);
  await new Promise((resolve) => setTimeout(resolve, 10));

  await harness.command.handler("openai", harness.ctx);

  assert.equal(harness.reloadCount(), 0);
  assert.match(harness.notifications.at(-1)?.message ?? "", /already active/i);
  assert.deepEqual(await snapshotTree(harness.root), before);
});

test("unknown, malformed, preview, and aligned switch inputs do not write or reload", async () => {
  const harness = await createHarness();

  await harness.command.handler("constructor", harness.ctx);
  await harness.command.handler("preview constructor", harness.ctx);
  await harness.command.handler("preview", harness.ctx);
  assert.equal(harness.reloadCount(), 0);
  assert.match(harness.notifications.at(-1)?.message ?? "", /Usage:/);

  await harness.command.handler("openai", harness.ctx);
  assert.equal(harness.reloadCount(), 0);
  assert.match(harness.notifications.at(-1)?.message ?? "", /already active/i);

  const beforeCanonical = await readFile(harness.canonicalPath, "utf8");
  const beforeRuntime = await readFile(harness.runtimePath, "utf8");
  const beforeCanonicalStat = await stat(harness.canonicalPath);
  const beforeRuntimeStat = await stat(harness.runtimePath);
  await new Promise((resolve) => setTimeout(resolve, 5));
  await harness.command.handler("openai", harness.ctx);
  assert.equal(await readFile(harness.canonicalPath, "utf8"), beforeCanonical);
  assert.equal(await readFile(harness.runtimePath, "utf8"), beforeRuntime);
  assert.equal((await stat(harness.canonicalPath)).mtimeMs, beforeCanonicalStat.mtimeMs);
  assert.equal((await stat(harness.runtimePath)).mtimeMs, beforeRuntimeStat.mtimeMs);
  assert.equal(harness.reloadCount(), 0);
});

test("switch repairs missing newly managed research entries while rejecting malformed existing data", async () => {
  const harness = await createHarness();
  const canonical = await readJson(harness.canonicalPath);
  const runtime = await readJson(harness.runtimePath);
  delete canonical["jd-fix-agent"];
  delete runtime.model_profiles["jd-fix-agent"];
  await writeJson(harness.canonicalPath, canonical);
  await writeJson(harness.runtimePath, runtime);

  await harness.command.handler("grok", harness.ctx);
  assert.equal(harness.reloadCount(), 1);
  assert.deepEqual((await readJson(harness.canonicalPath))["jd-fix-agent"], { model: "xai/jd-fix-agent", thinking: "xhigh" });
  assert.deepEqual((await readJson(harness.runtimePath)).model_profiles["jd-fix-agent"], { model: "xai/jd-fix-agent", effort: "xhigh" });

  const malformed = await readJson(harness.runtimePath);
  malformed.model_profiles["gentle-ai-explore"] = { model: "broken-only", effort: "high" };
  await writeJson(harness.runtimePath, malformed);
  const before = await readFile(harness.runtimePath, "utf8");
  await harness.command.handler("openai", harness.ctx);
  assert.equal(harness.reloadCount(), 1);
  assert.match(harness.notifications.at(-1)?.message ?? "", /provider\/model identifier/);
  assert.equal(await readFile(harness.runtimePath, "utf8"), before);
});

test("undo command and completions use transaction history through the command seam", async () => {
  const harness = await createHarness();

  assert.ok(harness.command.getArgumentCompletions?.("u")?.some((item) => item.value === "undo"));
  assert.ok(harness.command.getArgumentCompletions?.("r")?.some((item) => item.value === "recover"));

  await harness.command.handler("grok", harness.ctx);
  assert.equal(harness.reloadCount(), 1);
  assert.equal((await inspectModelProfileTransactions({ canonicalPath: harness.canonicalPath, runtimePath: harness.runtimePath, journalDir: harness.journalDir })).history.length, 1);

  await harness.command.handler("undo", harness.ctx);
  assert.equal(harness.reloadCount(), 2);
  assert.match(harness.notifications.at(-1)?.message ?? "", /undone/i);
  assert.deepEqual((await readJson(harness.canonicalPath))["gentle-ai-explore"], { model: "openai-codex/gentle-ai-explore", thinking: "high" });
  assert.deepEqual((await readJson(harness.runtimePath)).model_profiles["gentle-ai-explore"], { model: "openai-codex/gentle-ai-explore", effort: "high" });
});

test("undo reload failure keeps undone shared files and reports live alignment as not established", async () => {
  const harness = await createHarness();
  await harness.command.handler("grok", harness.ctx);
  let reloads = 0;
  harness.ctx.reload = async () => { reloads++; throw new Error("reload unavailable"); };

  await harness.command.handler("undo", harness.ctx);

  assert.equal(reloads, 1);
  assert.equal(harness.notifications.at(-1)?.level, "error");
  assert.match(harness.notifications.at(-1)?.message ?? "", /reload unavailable.*shared undo files remain applied.*live orchestrator alignment is not established.*\/reload manually or restart Pi/s);
  assert.deepEqual((await readJson(harness.canonicalPath))["gentle-ai-explore"], { model: "openai-codex/gentle-ai-explore", thinking: "high" });
  assert.deepEqual((await readJson(harness.runtimePath)).model_profiles["gentle-ai-explore"], { model: "openai-codex/gentle-ai-explore", effort: "high" });
  // Undo restores files only; the live session stays on the previously switched model.
  assert.deepEqual(harness.session(), { model: { provider: "xai", id: "orchestrator" }, thinking: "xhigh" });
});

test("semantic no-op switch leaves transaction history bytes and reload count unchanged", async () => {
  const harness = await createHarness();
  await harness.command.handler("grok", harness.ctx);
  const historyBefore = await inspectModelProfileTransactions({ canonicalPath: harness.canonicalPath, runtimePath: harness.runtimePath, journalDir: harness.journalDir });
  const canonicalBefore = await readFile(harness.canonicalPath, "utf8");
  const runtimeBefore = await readFile(harness.runtimePath, "utf8");
  const treeBefore = await snapshotTree(harness.root);
  await new Promise((resolve) => setTimeout(resolve, 10));

  await harness.command.handler("grok", harness.ctx);

  const historyAfter = await inspectModelProfileTransactions({ canonicalPath: harness.canonicalPath, runtimePath: harness.runtimePath, journalDir: harness.journalDir });
  assert.equal(harness.reloadCount(), 1);
  assert.equal(await readFile(harness.canonicalPath, "utf8"), canonicalBefore);
  assert.equal(await readFile(harness.runtimePath, "utf8"), runtimeBefore);
  assert.deepEqual(historyAfter, historyBefore);
  assert.deepEqual(await snapshotTree(harness.root), treeBefore);
});

test("switch to the aligned profile removes exactly the retired routes and keeps custom routes", async () => {
  const harness = await createHarness();
  const canonical = await readJson(harness.canonicalPath);
  const runtime = await readJson(harness.runtimePath);
  const managedCanonical = JSON.stringify(canonical);
  const managedRuntime = JSON.stringify(runtime);
  for (const agent of [...RETIRED_MANAGED_AGENTS, "sdd-custom"]) {
    canonical[agent] = { model: "legacy/route", thinking: "low" };
    runtime.model_profiles[agent] = { model: "legacy/route", effort: "low" };
  }
  await writeJson(harness.canonicalPath, canonical);
  await writeJson(harness.runtimePath, runtime);

  await harness.command.handler("doctor", harness.ctx);
  const doctor = harness.notifications.at(-1)?.message ?? "";
  assert.ok(doctor.includes(`Retired legacy mappings present: ${RETIRED_MANAGED_AGENTS.join(", ")};`));
  assert.match(doctor, /Unrelated runtime mappings preserved: sdd-custom, unrelatedAgent$/m);

  await harness.command.handler("openai", harness.ctx);
  assert.equal(harness.reloadCount(), 1);
  const nextCanonical = await readJson(harness.canonicalPath);
  const nextRuntime = await readJson(harness.runtimePath);
  for (const agent of RETIRED_MANAGED_AGENTS) {
    assert.equal(Object.hasOwn(nextCanonical, agent), false, agent);
    assert.equal(Object.hasOwn(nextRuntime.model_profiles, agent), false, agent);
  }
  assert.deepEqual(nextCanonical["sdd-custom"], { model: "legacy/route", thinking: "low" });
  assert.deepEqual(nextRuntime.model_profiles["sdd-custom"], { model: "legacy/route", effort: "low" });
  delete nextCanonical["sdd-custom"];
  delete nextRuntime.model_profiles["sdd-custom"];
  assert.deepEqual(nextCanonical, JSON.parse(managedCanonical));
  assert.deepEqual(nextRuntime, JSON.parse(managedRuntime));

  await harness.command.handler("openai", harness.ctx);
  assert.equal(harness.reloadCount(), 1);
  assert.match(harness.notifications.at(-1)?.message ?? "", /already active/);
});

test("aligned switch refuses active or ambiguous transaction state instead of claiming healthy no-op", async () => {
  const activeHarness = await createHarness();
  const script = `
    import { runModelProfileTransaction } from ${JSON.stringify(new URL("../extensions/model-profiles/transaction.ts", import.meta.url).href)};
    await runModelProfileTransaction(${JSON.stringify({ canonicalPath: activeHarness.canonicalPath, runtimePath: activeHarness.runtimePath, journalDir: activeHarness.journalDir })}, {
      operation: "switch",
      plan: () => ({
        canonicalContent: ${JSON.stringify(`${JSON.stringify({ ...profile("xai", "xhigh"), unmanagedCanonical: { model: "keep/me", thinking: "low" } }, null, 2)}\n`)},
        runtimeContent: ${JSON.stringify(`${JSON.stringify({ model_profiles: { ...Object.fromEntries(agents.map((agent) => [agent, { model: `xai/${agent}`, effort: "xhigh" }])), unrelatedAgent: { model: "keep/runtime", effort: "low" } }, unrelatedTopLevel: true }, null, 2)}\n`)},
      }),
      faultHook: (event) => { if (event === "after-journal") process.exit(47); },
    });
  `;
  const child = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "--eval", script], { encoding: "utf8" });
  assert.equal(child.status, 47, child.stderr);
  await activeHarness.command.handler("openai", activeHarness.ctx);
  assert.equal(activeHarness.reloadCount(), 0);
  assert.doesNotMatch(activeHarness.notifications.at(-1)?.message ?? "", /profile is already active/i);
  assert.match(activeHarness.notifications.at(-1)?.message ?? "", /transaction is already active|lock/i);

  const ambiguousHarness = await createHarness();
  await mkdir(ambiguousHarness.journalDir, { recursive: true });
  await writeFile(join(ambiguousHarness.journalDir, "active.json"), "{malformed", "utf8");
  await ambiguousHarness.command.handler("openai", ambiguousHarness.ctx);
  assert.equal(ambiguousHarness.reloadCount(), 0);
  assert.doesNotMatch(ambiguousHarness.notifications.at(-1)?.message ?? "", /profile is already active/i);
  assert.match(ambiguousHarness.notifications.at(-1)?.message ?? "", /transaction|journal|JSON/i);

  const lockHarness = await createHarness();
  await mkdir(lockHarness.journalDir, { recursive: true });
  await writeJson(join(lockHarness.journalDir, "lock.json"), {
    pid: process.pid,
    token: "live",
    createdAt: new Date().toISOString(),
    targetIdentity: { canonicalPath: lockHarness.canonicalPath, runtimePath: lockHarness.runtimePath },
  });
  await lockHarness.command.handler("openai", lockHarness.ctx);
  assert.equal(lockHarness.reloadCount(), 0);
  assert.doesNotMatch(lockHarness.notifications.at(-1)?.message ?? "", /profile is already active/i);
  assert.match(lockHarness.notifications.at(-1)?.message ?? "", /lock/i);
});

test("recover command reports deterministic transaction recovery through the command seam", async () => {
  const harness = await createHarness();
  await harness.command.handler("recover", harness.ctx);
  assert.equal(harness.reloadCount(), 0);
  assert.match(harness.notifications.at(-1)?.message ?? "", /No model profile transaction needs recovery/i);
});

test("recover command finishes a real interrupted active switch through the command seam", async () => {
  const harness = await createHarness();
  const script = `
    import { runModelProfileTransaction } from ${JSON.stringify(new URL("../extensions/model-profiles/transaction.ts", import.meta.url).href)};
    await runModelProfileTransaction(${JSON.stringify({ canonicalPath: harness.canonicalPath, runtimePath: harness.runtimePath, journalDir: harness.journalDir })}, {
      operation: "switch",
      plan: () => ({
        canonicalContent: ${JSON.stringify(`${JSON.stringify({ ...profile("xai", "xhigh"), unmanagedCanonical: { model: "keep/me", thinking: "low" } }, null, 2)}\n`)},
        runtimeContent: ${JSON.stringify(`${JSON.stringify({ model_profiles: { ...Object.fromEntries(agents.map((agent) => [agent, { model: `xai/${agent}`, effort: "xhigh" }])), unrelatedAgent: { model: "keep/runtime", effort: "low" } }, unrelatedTopLevel: true }, null, 2)}\n`)},
      }),
      faultHook: (event) => { if (event === "after-replace:canonical") process.exit(46); },
    });
  `;
  const child = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "--eval", script], { encoding: "utf8" });
  assert.equal(child.status, 46, child.stderr);
  assert.deepEqual((await readJson(harness.canonicalPath))["gentle-ai-explore"], { model: "xai/gentle-ai-explore", thinking: "xhigh" });
  assert.deepEqual((await readJson(harness.runtimePath)).model_profiles["gentle-ai-explore"], { model: "openai-codex/gentle-ai-explore", effort: "high" });

  await harness.command.handler("recover", harness.ctx);

  assert.equal(harness.reloadCount(), 1);
  assert.match(harness.notifications.at(-1)?.message ?? "", /recovery finished/i);
  assert.deepEqual((await readJson(harness.runtimePath)).model_profiles["gentle-ai-explore"], { model: "xai/gentle-ai-explore", effort: "xhigh" });
});

test("recover reload failure keeps recovered shared files and reports live alignment as not established", async () => {
  const harness = await createHarness();
  const script = `
    import { runModelProfileTransaction } from ${JSON.stringify(new URL("../extensions/model-profiles/transaction.ts", import.meta.url).href)};
    await runModelProfileTransaction(${JSON.stringify({ canonicalPath: harness.canonicalPath, runtimePath: harness.runtimePath, journalDir: harness.journalDir })}, {
      operation: "switch",
      plan: () => ({
        canonicalContent: ${JSON.stringify(`${JSON.stringify({ ...profile("xai", "xhigh"), unmanagedCanonical: { model: "keep/me", thinking: "low" } }, null, 2)}\n`)},
        runtimeContent: ${JSON.stringify(`${JSON.stringify({ model_profiles: { ...Object.fromEntries(agents.map((agent) => [agent, { model: `xai/${agent}`, effort: "xhigh" }])), unrelatedAgent: { model: "keep/runtime", effort: "low" } }, unrelatedTopLevel: true }, null, 2)}\n`)},
      }),
      faultHook: (event) => { if (event === "after-replace:canonical") process.exit(46); },
    });
  `;
  const child = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "--eval", script], { encoding: "utf8" });
  assert.equal(child.status, 46, child.stderr);
  let reloads = 0;
  harness.ctx.reload = async () => { reloads++; throw new Error("reload unavailable"); };

  await harness.command.handler("recover", harness.ctx);

  assert.equal(reloads, 1);
  assert.equal(harness.notifications.at(-1)?.level, "error");
  assert.match(harness.notifications.at(-1)?.message ?? "", /reload unavailable.*recovered shared profile files remain applied.*live orchestrator alignment is not established.*\/reload manually or restart Pi/s);
  assert.deepEqual((await readJson(harness.runtimePath)).model_profiles["gentle-ai-explore"], { model: "xai/gentle-ai-explore", effort: "xhigh" });
  // Recovery touches files only; the live session is not realigned.
  assert.deepEqual(harness.session(), { model: { provider: "openai-codex", id: "orchestrator" }, thinking: "high" });
});

test("registered editor uses all invoking live models, not scoped models, and saves without activation", async () => {
  const h = await createHarness();
  const saved = await readJson(join(h.gentleDir, "models.openai.json"));
  const live = Object.values(saved).map((entry: any) => {
    const slash = entry.model.indexOf("/");
    return { provider: entry.model.slice(0, slash), id: entry.model.slice(slash + 1), name: entry.model, reasoning: true };
  });
  live.push({ provider: "custom", id: "only-live", name: "Custom live", reasoning: true });
  h.ctx.scopedModels = [];
  let calls = 0;
  h.ctx.modelRegistry.getAvailable = function () { assert.equal(this, h.ctx.modelRegistry); calls++; return live; };
  const beforeCanonical = await readFile(h.canonicalPath, "utf8");
  const beforeRuntime = await readFile(h.runtimePath, "utf8");
  let step = 0;
  h.ctx.ui.select = async (_title, options) => {
    step++;
    if (step === 1) return "Edit";
    if (step === 2) return "openai";
    if (step === 3) return options.find((value) => value.startsWith("orchestrator:"));
    if (step === 4) {
      assert.deepEqual(new Set(options), new Set(live.map((model) => `${model.provider}/${model.id} — ${model.name}`)));
      return "custom/only-live — Custom live";
    }
    if (step === 5) return "low";
    return "Save";
  };
  h.ctx.ui.input = async () => undefined;
  h.ctx.ui.confirm = async () => true;
  await h.command.handler("edit", h.ctx);
  assert.equal(calls, 1);
  assert.match(h.notifications.at(-1)?.message ?? "", /Saved profile openai/);
  assert.deepEqual((await readJson(join(h.gentleDir, "models.openai.json"))).orchestrator, { model: "custom/only-live", thinking: "low" });
  assert.equal(await readFile(h.canonicalPath, "utf8"), beforeCanonical);
  assert.equal(await readFile(h.runtimePath, "utf8"), beforeRuntime);
  assert.deepEqual(h.modelCalls, []);
  assert.deepEqual(h.thinkingCalls, []);
  assert.equal(h.reloadCount(), 0);
});

test("nested Pi model IDs survive activation lookup and active-state validation", async () => {
  const h = await createHarness();
  const custom = profile("custom", "high");
  custom.orchestrator.model = "custom/vendor/family/model";
  await writeJson(join(h.gentleDir, "models.local.json"), custom);
  const lookups: string[][] = [];
  h.ctx.modelRegistry.find = (provider, id) => { lookups.push([provider, id]); return { provider, id }; };
  await h.command.handler("local", h.ctx);
  assert.ok(lookups.some(([provider, id]) => provider === "custom" && id === "vendor/family/model"));
  assert.equal((await readJson(h.canonicalPath)).orchestrator.model, "custom/vendor/family/model");
  assert.equal((await readJson(h.runtimePath)).model_profiles.orchestrator.model, "custom/vendor/family/model");
  await h.command.handler("status", h.ctx);
  assert.match(h.notifications.at(-1)?.message ?? "", /Persisted ODD profile: local/);
});

test("edit subcommand opens the profile editor without applying the active profile", async () => {
  const harness = await createHarness();
  assert.ok(harness.command.getArgumentCompletions?.("e")?.some((item) => item.value === "edit"));
  await harness.command.handler("edit extra", harness.ctx);
  assert.match(harness.notifications.at(-1)?.message ?? "", /Unknown argument: edit extra/);
  assert.equal(harness.reloadCount(), 0);

  const before = await snapshotTree(harness.root);
  let step = 0;
  harness.ctx.ui.select = async (_title, options) => {
    step += 1;
    if (step === 1) return options.includes("View") ? "View" : options[0];
    return options.includes("openai") ? "openai" : options[0];
  };
  harness.ctx.ui.confirm = async () => false;
  harness.ctx.ui.input = async () => undefined;
  await harness.command.handler("edit", harness.ctx);
  assert.equal(harness.reloadCount(), 0);
  assert.match(harness.notifications.at(-1)?.message ?? "", /Profile: openai/);
  assert.deepEqual(await snapshotTree(harness.root), before);
  assert.deepEqual((await readJson(harness.canonicalPath)).orchestrator, { model: "openai-codex/orchestrator", thinking: "high" });
});
