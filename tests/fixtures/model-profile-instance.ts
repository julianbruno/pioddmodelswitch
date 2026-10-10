// Two-instance fixture for /jb-odd-models.
//
// Parent side (imported by tests): seeds a disposable PI_HOME and spawns instance processes.
// Child side (run as a script): loads the real extension default export with fake Pi APIs,
// keeps fake live model/thinking/reload state in memory, and answers line-delimited JSON
// requests on stdin. Only files are real; model switching and reload are fakes, and no
// installed Pi or Gentle code is loaded.

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";

type Entry = { model: string; thinking: string };
type Notification = { message: string; level: string };
type Session = { model: { provider: string; id: string } | undefined; thinking: string };

export type InstanceState = {
  session: Session;
  reloadCount: number;
  modelCalls: string[];
  thinkingCalls: string[];
  notifications: Notification[];
};

export type InstanceHandle = {
  name: string;
  pid: number;
  run(args: string): Promise<InstanceState>;
  state(): Promise<InstanceState>;
  failReloads(message: string | null): Promise<InstanceState>;
  close(): Promise<void>;
};

const normalAgents = ["orchestrator", "gentle-ai-explore", "gentle-ai-verify", "jd-fix-agent", "gentle-ai-worker"];
const judgeAgents = ["review-risk", "review-resilience", "review-readability", "review-reliability", "jd-judge-a", "jd-judge-b"];
const agents = [...normalAgents, ...judgeAgents];

function profile(prefix: string, effort: string): Record<string, Entry> {
  return Object.fromEntries(agents.map((agent) => [agent, { model: `${prefix}/${agent}`, thinking: effort }]));
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

// Seeds the same openai-active layout as tests/command-behavior.test.ts under a fresh temp root.
export async function createDisposablePiHome(): Promise<{ root: string; canonicalPath: string; runtimePath: string; close(): Promise<void> }> {
  const root = await mkdtemp(join(tmpdir(), "odd-model-profiles-multi-"));
  // The closure owns exactly this mkdtemp result, never a caller-provided path.
  let cleanup: Promise<void> | undefined;
  const close = () => cleanup ??= rm(root, { recursive: true, force: true });
  try {
    await seedHome(root);
    return { root, canonicalPath: join(root, "gentle-ai", "models.json"), runtimePath: join(root, "agent", "subagents.json"), close };
  } catch (error) {
    await close();
    throw error;
  }
}

async function seedHome(root: string): Promise<void> {
  const gentleDir = join(root, "gentle-ai");
  const agentDir = join(root, "agent");
  await mkdir(gentleDir, { recursive: true });
  await mkdir(agentDir, { recursive: true });
  await writeJson(join(gentleDir, "model-profiles.manifest.json"), {
    schemaVersion: 2,
    defaultProfile: "openai",
    managedAgentGroups: { odd: normalAgents },
    reservedCommandNames: ["status", "list", "preview", "doctor", "undo", "recover"],
    oppositeProviderJudges: { enabled: true, agents: judgeAgents, profilePairs: { openai: "grok", grok: "openai" } },
    profiles: [
      { name: "openai", modelsFile: "models.openai.json" },
      { name: "grok", modelsFile: "models.grok.json" },
      { name: "local", modelsFile: "models.local.json" },
    ],
  });
  await writeJson(join(gentleDir, "models.openai.json"), profile("openai-codex", "high"));
  await writeJson(join(gentleDir, "models.grok.json"), profile("xai", "xhigh"));
  await writeJson(join(gentleDir, "models.local.json"), profile("local", "medium"));
  const canonical = Object.fromEntries([
    ...normalAgents.map((agent) => [agent, { model: `openai-codex/${agent}`, thinking: "high" }]),
    ...judgeAgents.map((agent) => [agent, { model: `xai/${agent}`, thinking: "xhigh" }]),
  ]);
  await writeJson(join(gentleDir, "models.json"), canonical);
  const runtime = Object.fromEntries(Object.entries(canonical).map(([agent, entry]) => [agent, { model: entry.model, effort: entry.thinking }]));
  await writeJson(join(agentDir, "subagents.json"), { model_profiles: runtime });
}

export async function snapshotTree(root: string): Promise<Array<{ path: string; mtimeMs: number; content?: string }>> {
  const records: Array<{ path: string; mtimeMs: number; content?: string }> = [];
  async function walk(path: string): Promise<void> {
    const current = await stat(path);
    const record: { path: string; mtimeMs: number; content?: string } = { path: relative(root, path) || ".", mtimeMs: current.mtimeMs };
    records.push(record);
    if (!current.isDirectory()) {
      record.content = await readFile(path, "utf8");
      return;
    }
    for (const entry of (await readdir(path, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
      await walk(join(path, entry.name));
    }
  }
  await walk(root);
  return records;
}

export type LifecycleOptions = { spawn?: typeof spawn; timeoutMs?: number };

// Capture each successful start inside the cleanup boundary, including partial startup.
export async function withStartedInstances(
  roots: { a: string; b: string },
  run: (a: InstanceHandle, b: InstanceHandle) => Promise<void>,
  start: typeof startInstance = startInstance,
): Promise<void> {
  const started: InstanceHandle[] = [];
  try {
    const a = await start("A", roots.a);
    started.push(a);
    const b = await start("B", roots.b);
    started.push(b);
    await run(a, b);
  } finally {
    const results = await Promise.allSettled(started.map((instance) => instance.close()));
    const failures = results.filter((result) => result.status === "rejected");
    if (failures.length) throw new AggregateError(failures.map((result) => result.reason), "Instance cleanup failed");
  }
}

export async function startInstance(name: string, piHome: string, options: LifecycleOptions = {}): Promise<InstanceHandle> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("timeoutMs must be positive and finite");
  const child: ChildProcessWithoutNullStreams = (options.spawn ?? spawn)(process.execPath, ["--experimental-strip-types", fileURLToPath(import.meta.url), piHome], {
    env: { ...process.env, PI_HOME: piHome },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr = (stderr + String(chunk)).slice(-4096); });
  const lines = createInterface({ input: child.stdout });
  const pending: Array<{ resolve(value: any): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }> = [];
  let terminal: Error | undefined;
  let closed = false;
  let closing: Promise<void> | undefined;
  let markClosed!: () => void;
  const closedPromise = new Promise<void>((resolve) => { markClosed = resolve; });
  const fail = (error: Error) => {
    terminal ??= error;
    for (const waiter of pending.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  };
  child.on("error", (error) => {
    fail(new Error(`${name}: ${error.message}`));
    // Failed spawns have no process to reap.
    if (!child.pid) { closed = true; markClosed(); }
  });
  child.stdin.on("error", (error) => fail(new Error(`${name}: ${error.message}`)));
  child.on("exit", (code, signal) => fail(new Error(`${name} exited (${code ?? signal}): ${stderr}`)));
  child.on("close", () => {
    closed = true;
    fail(new Error(`${name} closed`));
    lines.close();
    markClosed();
  });
  lines.on("line", (line) => {
    const waiter = pending.shift();
    if (!waiter) return;
    clearTimeout(waiter.timer);
    try {
      const reply = JSON.parse(line);
      if (reply.error) waiter.reject(new Error(`${name}: ${reply.error}`));
      else waiter.resolve(reply);
    } catch (error) {
      waiter.reject(new Error(`${name}: invalid reply: ${String(error)}`));
      fail(new Error(`${name}: invalid reply`));
    }
  });
  const waitForClose = (): Promise<boolean> => new Promise((resolve) => {
    if (closed) return resolve(true);
    const timer = setTimeout(() => resolve(false), timeoutMs);
    closedPromise.then(() => { clearTimeout(timer); resolve(true); });
  });
  const close = (): Promise<void> => closing ??= (async () => {
    fail(new Error(`${name} closed`));
    if (closed) return;
    child.stdin.end();
    if (await waitForClose()) return;
    child.kill("SIGTERM");
    if (await waitForClose()) return;
    child.kill("SIGKILL");
    if (await waitForClose()) return;
    throw new Error(`${name}: shutdown timed out after SIGKILL`);
  })();
  const request = (message: { op: string; [key: string]: unknown }): Promise<any> => {
    if (terminal || closing) return Promise.reject(terminal ?? new Error(`${name} closed`));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // A missing reply invalidates FIFO correlation; never reuse this channel.
        fail(new Error(`${name}: ${message.op} timed out`));
      }, timeoutMs);
      pending.push({ resolve, reject, timer });
      child.stdin.write(`${JSON.stringify(message)}\n`, (error) => { if (error) fail(error); });
    });
  };
  try {
    const ready: { pid: number } = await request({ op: "ready" });
    return {
      name,
      pid: ready.pid,
      run: (args) => request({ op: "run", args }),
      state: () => request({ op: "state" }),
      failReloads: (message) => request({ op: "failReloads", message }),
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}

async function runChild(piHome: string): Promise<void> {
  const { default: oddModelProfiles } = await import(new URL("../../extensions/odd-model-profiles.ts", import.meta.url).href);
  const commands = new Map<string, { handler(args: string, ctx: unknown): Promise<void> | void }>();
  let current: Session["model"] = { provider: "openai-codex", id: "orchestrator" };
  let thinking = "high";
  let reloadCount = 0;
  let reloadFailure: string | null = null;
  const modelCalls: string[] = [];
  const thinkingCalls: string[] = [];
  const notifications: Notification[] = [];
  const pi = {
    registerCommand: (commandName: string, command: { handler(args: string, ctx: unknown): Promise<void> | void }) => commands.set(commandName, command),
    // Mirrors the in-process harness: a model change resets thinking, so the extension must reapply it.
    setModel: async (model: { provider: string; id: string }) => { modelCalls.push(`${model.provider}/${model.id}`); current = { provider: model.provider, id: model.id }; thinking = "low"; return true; },
    getThinkingLevel: () => thinking,
    setThinkingLevel: (level: string) => { thinkingCalls.push(level); thinking = level; },
  };
  oddModelProfiles(pi, { piHome });
  const command = commands.get("jb-odd-models");
  if (!command) throw new Error("jb-odd-models was not registered");
  const ctx = {
    cwd: piHome,
    get model() { return current; },
    modelRegistry: { find: (provider: string, id: string) => ({ provider, id }) },
    ui: { notify: (message: string, level: string) => { notifications.push({ message, level }); } },
    reload: async () => { reloadCount += 1; if (reloadFailure) throw new Error(reloadFailure); },
  };
  const state = (): InstanceState => ({ session: { model: current, thinking }, reloadCount, modelCalls: [...modelCalls], thinkingCalls: [...thinkingCalls], notifications: [...notifications] });

  // Requests are handled strictly in order so each reply matches the oldest pending request.
  for await (const line of createInterface({ input: process.stdin })) {
    try {
      const message = JSON.parse(line);
      if (message.op === "ready") process.stdout.write(`${JSON.stringify({ pid: process.pid })}\n`);
      else if (message.op === "run") { await command.handler(message.args, ctx); process.stdout.write(`${JSON.stringify(state())}\n`); }
      else if (message.op === "state") process.stdout.write(`${JSON.stringify(state())}\n`);
      else if (message.op === "failReloads") { reloadFailure = message.message; process.stdout.write(`${JSON.stringify(state())}\n`); }
      else throw new Error(`unknown op ${message.op}`);
    } catch (error) {
      process.stdout.write(`${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const piHome = process.argv[2];
  if (!piHome) throw new Error("usage: model-profile-instance.ts <disposable PI_HOME>");
  await runChild(piHome);
}
