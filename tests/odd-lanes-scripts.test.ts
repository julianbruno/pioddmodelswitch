import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, lstat, mkdir, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import test, { after } from "node:test";

const execFileAsync = promisify(execFile);

const packageRoot = resolve(".");
const setupScript = join(packageRoot, "scripts", "setup-odd-lanes.sh");
const opusLauncher = join(packageRoot, "scripts", "pi-opus.sh");
const gptLauncher = join(packageRoot, "scripts", "pi-gpt.sh");

type JsonObject = Record<string, any>;

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readJson(path: string): Promise<JsonObject> {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

// Every root this suite creates is tracked here and removed after the run.
const createdRoots: string[] = [];

after(async () => {
  await Promise.all(createdRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function tempRoot(name: string): Promise<string> {
  const dir = join(tmpdir(), `${name}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(dir, { recursive: true });
  createdRoots.push(dir);
  return realpath(dir);
}

// A fake HOME keeps default lane paths and the installer away from the developer's real ~/.pi.
async function laneEnv(home: string, overrides: Record<string, string> = {}): Promise<NodeJS.ProcessEnv> {
  const env: NodeJS.ProcessEnv = { ...process.env, HOME: home, ...overrides };
  delete env.PI_HOME;
  delete env.PI_CODING_AGENT_DIR;
  delete env.GENTLE_PI_AGENT_HOME;
  delete env.GENTLE_PI_CONFIG_HOME;
  return env;
}

async function run(script: string, args: string[], env: NodeJS.ProcessEnv): Promise<RunResult> {
  try {
    const { stdout, stderr } = await execFileAsync(script, args, { env, timeout: 180_000 });
    return { code: 0, stdout, stderr };
  } catch (error: any) {
    if (typeof error?.code !== "number") throw error;
    return { code: error.code, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
  }
}

async function snapshotTree(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string, prefix: string): Promise<void> {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        out.push(`${rel}/`);
        await walk(full, rel);
      } else {
        const info = await stat(full);
        out.push(`${rel}:${entry.isSymbolicLink() ? "link" : "file"}:${info.size}`);
      }
    }
  }
  await walk(root, "");
  return out;
}

async function prepareSource(home: string): Promise<string> {
  const source = join(home, ".pi");
  await mkdir(join(source, "agent", "extensions"), { recursive: true });
  await mkdir(join(source, "agent", "npm", "node_modules", "fake-pkg"), { recursive: true });
  await mkdir(join(source, "agent", "sessions", "old"), { recursive: true });
  await writeFile(join(source, "agent", "sessions", "old", "session.jsonl"), "{}\n", "utf8");
  await writeFile(join(source, "agent", "npm", "node_modules", "fake-pkg", "index.js"), "module.exports = 1;\n", "utf8");
  await writeJson(join(source, "agent", "auth.json"), { provider: "fake", token: "source-auth" });
  await writeJson(join(source, "agent", "settings.json"), { theme: "source" });
  await writeJson(join(source, "agent", "subagents.json"), { source_marker: { model: "x", thinking: "low" } });
  await writeFile(join(source, "agent", "extensions", "user-extension.ts"), "export default function () {}\n", "utf8");
  return source;
}

async function setupLanes(home: string, extra: Record<string, string> = {}): Promise<{ result: RunResult; opus: string; gpt: string }> {
  const opus = join(home, "lane-opus");
  const gpt = join(home, "lane-gpt");
  const env = await laneEnv(home, { PI_LANE_SOURCE: join(home, ".pi"), PI_LANE_OPUS_HOME: opus, PI_LANE_GPT_HOME: gpt, ...extra });
  const result = await run(setupScript, [], env);
  return { result, opus, gpt };
}

test("setup scripts exist and are executable", async () => {
  for (const script of [setupScript, opusLauncher, gptLauncher]) {
    const info = await stat(script);
    assert.ok(info.isFile(), `${script} must be a regular file`);
    assert.equal(info.mode & 0o111, 0o111, `${script} must be executable by all`);
  }
});

test("setup refuses when a dest equals the source and leaves the source untouched", async () => {
  const home = await tempRoot("odd-lanes-refuse");
  const source = await prepareSource(home);
  const before = await snapshotTree(source);
  const env = await laneEnv(home, { PI_LANE_SOURCE: source, PI_LANE_OPUS_HOME: source, PI_LANE_GPT_HOME: join(home, "lane-gpt") });
  const result = await run(setupScript, [], env);
  assert.notEqual(result.code, 0, "setup must fail when a dest equals the source");
  assert.match(result.stderr, /source/i);
  assert.deepEqual(await snapshotTree(source), before, "source tree must not change");
  assert.equal(await exists(join(home, "lane-gpt")), false, "no dest should be created when refusing");
});

test("setup requires the source agent directory", async () => {
  const home = await tempRoot("odd-lanes-nosource");
  const env = await laneEnv(home, { PI_LANE_SOURCE: join(home, "missing"), PI_LANE_OPUS_HOME: join(home, "a"), PI_LANE_GPT_HOME: join(home, "b") });
  const result = await run(setupScript, [], env);
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /agent/);
});

test("setup creates both lane homes, copies identity files, symlinks bulky dirs, skips sessions, and never writes into the source", async () => {
  const home = await tempRoot("odd-lanes-create");
  const source = await prepareSource(home);
  const before = await snapshotTree(source);
  const { result, opus, gpt } = await setupLanes(home);
  assert.equal(result.code, 0, `setup failed: ${result.stderr}`);
  assert.deepEqual(await snapshotTree(source), before, "source tree must not change");

  for (const dest of [opus, gpt]) {
    assert.ok((await stat(join(dest, "agent"))).isDirectory());
    assert.ok((await stat(join(dest, "gentle-ai"))).isDirectory());
    assert.deepEqual(await readJson(join(dest, "agent", "auth.json")), { provider: "fake", token: "source-auth" });
    assert.deepEqual(await readJson(join(dest, "agent", "settings.json")), { theme: "source" });
    assert.ok((await lstat(join(dest, "agent", "npm"))).isSymbolicLink(), "npm must be a symlink");
    assert.equal(await realpath(join(dest, "agent", "npm")), await realpath(join(source, "agent", "npm")));
    assert.equal(await exists(join(dest, "agent", "sessions")), false, "sessions must not be copied");
    assert.ok(await exists(join(dest, "agent", "extensions", "user-extension.ts")), "source extensions are copied");
    assert.ok(await exists(join(dest, "agent", "extensions", "odd-model-profiles.ts")), "installer must add the extension");
    assert.ok(await exists(join(dest, "gentle-ai", "models.json")), "installer must write gentle-ai/models.json");
    assert.ok(await exists(join(dest, "agent", "subagents.json")));
    const runtime = await readJson(join(dest, "agent", "subagents.json"));
    assert.ok(runtime.source_marker, "source subagents.json is copied as the dest base");
  }
  assert.match(result.stdout, /jb-odd-models claude-opus-5\.5/);
  assert.match(result.stdout, /jb-odd-models openai6-1-gentle/);
  assert.match(result.stdout, new RegExp(opus.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(result.stdout, new RegExp(gpt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("second setup keeps existing dest identity and routing files", async () => {
  const home = await tempRoot("odd-lanes-idempotent");
  await prepareSource(home);
  const opus = join(home, "lane-opus");
  await writeJson(join(opus, "agent", "auth.json"), { provider: "fake", token: "dest-auth" });
  await writeJson(join(opus, "agent", "subagents.json"), { dest_marker: { model: "y", thinking: "high" } });
  const first = await setupLanes(home);
  assert.equal(first.result.code, 0, first.result.stderr);
  const second = await setupLanes(home);
  assert.equal(second.result.code, 0, second.result.stderr);

  assert.deepEqual(await readJson(join(opus, "agent", "auth.json")), { provider: "fake", token: "dest-auth" });
  const runtime = await readJson(join(opus, "agent", "subagents.json"));
  assert.ok(runtime.dest_marker, "existing dest subagents.json must be kept as the base");
  assert.equal(runtime.source_marker, undefined, "source subagents.json must not overwrite the dest");
});

test("setup writes an empty subagents.json when the source has none", async () => {
  const home = await tempRoot("odd-lanes-nosubagents");
  const source = join(home, ".pi");
  await mkdir(join(source, "agent"), { recursive: true });
  const { result, gpt } = await setupLanes(home);
  assert.equal(result.code, 0, result.stderr);
  assert.ok(await exists(join(gpt, "agent", "subagents.json")));
  assert.ok(await exists(join(gpt, "gentle-ai", "models.json")));
});

function expectedLaneEnv(laneHome: string): string[] {
  return [
    `PI_HOME=${laneHome}`,
    `PI_CODING_AGENT_DIR=${join(laneHome, "agent")}`,
    `GENTLE_PI_AGENT_HOME=${join(laneHome, "agent")}`,
    `GENTLE_PI_CONFIG_HOME=${join(laneHome, "gentle-ai")}`,
  ];
}

test("setup copies Gentle background-subagents.json and profiles.json into both lanes, never dev-binary.json", async () => {
  const home = await tempRoot("odd-lanes-gentle-copy");
  const source = await prepareSource(home);
  await writeJson(join(source, "gentle-ai", "background-subagents.json"), { enabled: true, marker: "source-bg" });
  await writeJson(join(source, "gentle-ai", "profiles.json"), { marker: "source-profiles" });
  await writeJson(join(source, "gentle-ai", "dev-binary.json"), { marker: "source-dev" });
  const before = await snapshotTree(source);
  const { result, opus, gpt } = await setupLanes(home);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(await snapshotTree(source), before, "source tree must not change");
  for (const dest of [opus, gpt]) {
    assert.deepEqual(await readJson(join(dest, "gentle-ai", "background-subagents.json")), { enabled: true, marker: "source-bg" });
    assert.deepEqual(await readJson(join(dest, "gentle-ai", "profiles.json")), { marker: "source-profiles" });
    assert.equal(await exists(join(dest, "gentle-ai", "dev-binary.json")), false, "dev-binary.json must not be copied");
  }
});

test("setup keeps existing lane Gentle background-subagents.json and profiles.json", async () => {
  const home = await tempRoot("odd-lanes-gentle-keep");
  const source = await prepareSource(home);
  await writeJson(join(source, "gentle-ai", "background-subagents.json"), { marker: "source-bg" });
  await writeJson(join(source, "gentle-ai", "profiles.json"), { marker: "source-profiles" });
  const opus = join(home, "lane-opus");
  await writeJson(join(opus, "gentle-ai", "background-subagents.json"), { marker: "dest-bg" });
  await writeJson(join(opus, "gentle-ai", "profiles.json"), { marker: "dest-profiles" });
  const { result, gpt } = await setupLanes(home);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(await readJson(join(opus, "gentle-ai", "background-subagents.json")), { marker: "dest-bg" });
  assert.deepEqual(await readJson(join(opus, "gentle-ai", "profiles.json")), { marker: "dest-profiles" });
  assert.deepEqual(await readJson(join(gpt, "gentle-ai", "background-subagents.json")), { marker: "source-bg" });
  assert.deepEqual(await readJson(join(gpt, "gentle-ai", "profiles.json")), { marker: "source-profiles" });
});

test("setup succeeds when the source has no Gentle state files", async () => {
  const home = await tempRoot("odd-lanes-gentle-none");
  await prepareSource(home);
  const { result, opus, gpt } = await setupLanes(home);
  assert.equal(result.code, 0, result.stderr);
  for (const dest of [opus, gpt]) {
    assert.equal(await exists(join(dest, "gentle-ai", "background-subagents.json")), false);
    assert.equal(await exists(join(dest, "gentle-ai", "profiles.json")), false);
    assert.equal(await exists(join(dest, "gentle-ai", "dev-binary.json")), false);
  }
});

test("launchers print the overridden lane env in dry-run mode", async () => {
  const home = await tempRoot("odd-lanes-dryrun");
  const opus = join(home, "lane-opus");
  const gpt = join(home, "lane-gpt");
  await mkdir(join(opus, "agent"), { recursive: true });
  await mkdir(join(gpt, "agent"), { recursive: true });
  const env = await laneEnv(home, { PI_LANE_OPUS_HOME: opus, PI_LANE_GPT_HOME: gpt, PI_LANE_DRY_RUN: "1" });

  const opusRun = await run(opusLauncher, ["--extra"], env);
  assert.equal(opusRun.code, 0, opusRun.stderr);
  assert.deepEqual(opusRun.stdout.trim().split("\n"), expectedLaneEnv(opus));

  const gptRun = await run(gptLauncher, [], env);
  assert.equal(gptRun.code, 0, gptRun.stderr);
  assert.deepEqual(gptRun.stdout.trim().split("\n"), expectedLaneEnv(gpt));
});

test("launchers default to HOME/.pi-opus and HOME/.pi-gpt", async () => {
  const home = await tempRoot("odd-lanes-defaults");
  await mkdir(join(home, ".pi-opus", "agent"), { recursive: true });
  await mkdir(join(home, ".pi-gpt", "agent"), { recursive: true });
  const env = await laneEnv(home, { PI_LANE_DRY_RUN: "1" });
  const opusRun = await run(opusLauncher, [], env);
  assert.equal(opusRun.code, 0, opusRun.stderr);
  assert.match(opusRun.stdout, new RegExp(`^PI_HOME=${join(home, ".pi-opus").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"));
  const gptRun = await run(gptLauncher, [], env);
  assert.equal(gptRun.code, 0, gptRun.stderr);
  assert.match(gptRun.stdout, new RegExp(`^PI_HOME=${join(home, ".pi-gpt").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"));
});

test("launchers fail when the lane agent directory is missing", async () => {
  const home = await tempRoot("odd-lanes-missing");
  const env = await laneEnv(home, { PI_LANE_OPUS_HOME: join(home, "nope"), PI_LANE_GPT_HOME: join(home, "nope2"), PI_LANE_DRY_RUN: "1" });
  for (const launcher of [opusLauncher, gptLauncher]) {
    const result = await run(launcher, [], env);
    assert.notEqual(result.code, 0, `${launcher} must fail without agent/`);
    assert.match(result.stderr, /setup-odd-lanes\.sh/);
  }
});
