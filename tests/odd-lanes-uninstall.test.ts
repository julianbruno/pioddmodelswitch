import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { lstat, mkdir, mkdtemp, readFile, readdir, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import test, { after } from "node:test";

const exec = promisify(execFile);
const script = resolve("scripts/uninstall-odd-lanes.sh");
const helper = resolve("scripts/uninstall-odd-lanes.ts");
const roots: string[] = [];
const labels = ["opus", "gpt", "grok"] as const;

after(async () => { await Promise.all(roots.map(root => rm(root, { recursive: true, force: true }))); });

async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true; } catch (error: any) { if (error.code === "ENOENT") return false; throw error; }
}

async function snapshot(root: string): Promise<unknown[]> {
  const entries: unknown[] = [];
  async function walk(path: string, relative: string) {
    const info = await lstat(path);
    if (info.isSymbolicLink()) { entries.push([relative, "link", await readlink(path)]); return; }
    entries.push([relative, info.isDirectory() ? "directory" : "file", info.mode & 0o777, info.isDirectory() ? undefined : await readFile(path, "utf8")]);
    if (info.isDirectory()) for (const name of (await readdir(path)).sort()) await walk(join(path, name), relative ? `${relative}/${name}` : name);
  }
  await walk(root, "");
  return entries;
}

async function fixture() {
  const root = await mkdtemp(resolve(".git/odd-lanes-uninstall-test-")); roots.push(root);
  const home = join(root, "home"), source = join(home, ".pi"), archive = join(home, ".pi-lanes-archive");
  await mkdir(join(source, "agent", "npm"), { recursive: true });
  await writeFile(join(source, "agent", "npm", "shared.txt"), "shared Pi must survive\n");
  const lanes = Object.fromEntries(labels.map(label => [label, join(home, `.pi-${label}`)])) as Record<typeof labels[number], string>;
  for (const label of labels) {
    const lane = lanes[label];
    await mkdir(join(lane, "agent", "sessions"), { recursive: true });
    await mkdir(join(lane, "gentle-ai"), { recursive: true });
    await writeFile(join(lane, "agent", "auth.json"), `fake-${label}-credentials\n`, { mode: 0o600 });
    await writeFile(join(lane, "agent", "sessions", "session.jsonl"), `session-${label}\n`);
    await writeFile(join(lane, "gentle-ai", "profiles.json"), `profile-${label}\n`);
    await symlink(join(source, "agent", "npm"), join(lane, "agent", "npm"));
  }
  const env = { ...process.env, HOME: home };
  for (const key of Object.keys(env)) if (key.startsWith("PI_LANE_") || key.startsWith("GENTLE_PI_") || key === "PI_HOME" || key === "PI_CODING_AGENT_DIR") delete env[key];
  return { root, home, source, archive, lanes, env };
}

async function run(env: NodeJS.ProcessEnv, args: string[] = [], preload?: string) {
  try {
    const command = preload ? process.execPath : "bash";
    const argv = preload ? ["--experimental-strip-types", "--import", preload, helper, ...args] : [script, ...args];
    const { stdout, stderr } = await exec(command, argv, { env, timeout: 10_000 });
    return { code: 0, stdout, stderr };
  } catch (error: any) {
    if (typeof error.code !== "number") throw error;
    return { code: error.code, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
  }
}

function plan(f: Awaited<ReturnType<typeof fixture>>, deletion: boolean) {
  return [`Dry run: ${deletion ? "permanently delete" : "archive"} ODD lanes (no files changed).`, ...labels.map(label => `${label}: ${f.lanes[label]}`), ...(deletion ? [] : [`Archive root: ${f.archive}`]), "Stop all Pi lane instances, then rerun with --yes.", ""].join("\n");
}

for (const args of [[], ["--dry-run"], ["--delete"], ["--delete", "--dry-run"]]) {
  test(`preview ${JSON.stringify(args)} is exact and leaves all data unchanged`, async () => {
    const f = await fixture(), before = await snapshot(f.home);
    assert.deepEqual(await run(f.env, args), { code: 0, stdout: plan(f, args.includes("--delete")), stderr: "" });
    assert.deepEqual(await snapshot(f.home), before);
  });
}

test("archive moves whole homes, preserves data and symlinks, and records restorable paths", async () => {
  const f = await fixture(), originalSource = await snapshot(f.source);
  const before = Object.fromEntries(await Promise.all(labels.map(async label => [label, await snapshot(f.lanes[label])])));
  const result = await run(f.env, ["--yes"]);
  assert.equal(result.code, 0, result.stderr); assert.equal(result.stderr, "");
  const bundles = await readdir(f.archive); assert.equal(bundles.length, 1);
  const bundle = join(f.archive, bundles[0]);
  assert.equal((await lstat(bundle)).mode & 0o777, 0o700);
  assert.equal(result.stdout, [`Archived ODD lanes into ${bundle}.`, ...labels.map(label => `${label}: ${f.lanes[label]} -> ${join(bundle, label)}`), ""].join("\n"));
  const manifest = JSON.parse(await readFile(join(bundle, "manifest.json"), "utf8"));
  assert.equal(manifest.kind, "jb-odd-models.lane-archive"); assert.equal(manifest.version, 1);
  assert.deepEqual(manifest.lanes, labels.map(label => ({ name: label, originalPath: f.lanes[label], archivedPath: join(bundle, label) })));
  assert.match(await readFile(join(bundle, "RESTORE.md"), "utf8"), /Never overwrite an existing lane home/);
  for (const label of labels) {
    assert.equal(await exists(f.lanes[label]), false);
    assert.deepEqual(await snapshot(join(bundle, label)), before[label]);
  }
  assert.deepEqual(await snapshot(f.source), originalSource);
});

test("--delete --yes removes only lane homes and makes no backup", async () => {
  const f = await fixture(), originalSource = await snapshot(f.source);
  const result = await run(f.env, ["--delete", "--yes"]);
  assert.deepEqual(result, { code: 0, stdout: ["Deleted ODD lanes permanently (no backup).", ...labels.map(label => `${label}: ${f.lanes[label]}`), ""].join("\n"), stderr: "" });
  for (const label of labels) assert.equal(await exists(f.lanes[label]), false);
  assert.equal(await exists(f.archive), false);
  assert.deepEqual(await snapshot(f.source), originalSource);
});

test("missing homes are skipped and an empty plan creates no archive", async () => {
  const f = await fixture();
  for (const label of labels) await rm(f.lanes[label], { recursive: true });
  const before = await snapshot(f.home);
  for (const args of [[], ["--yes"], ["--delete", "--yes"]]) {
    assert.deepEqual(await run(f.env, args), { code: 0, stdout: `No ODD lane homes found; nothing to ${args.includes("--delete") ? "delete" : "archive"}.\n`, stderr: "" });
    assert.deepEqual(await snapshot(f.home), before);
  }
});

test("existing home overrides are honored without touching default homes", async () => {
  const f = await fixture(), custom = join(f.root, "custom-opus");
  await mkdir(join(custom, "agent"), { recursive: true }); await mkdir(join(custom, "gentle-ai"));
  const env = { ...f.env, PI_LANE_OPUS_HOME: custom, PI_LANE_GPT_HOME: join(f.root, "missing-gpt"), PI_LANE_GROK_HOME: join(f.root, "missing-grok") };
  const before = await snapshot(f.home);
  const result = await run(env, ["--delete", "--yes"]);
  assert.deepEqual(result, { code: 0, stdout: `Deleted ODD lanes permanently (no backup).\nopus: ${custom}\n`, stderr: "" });
  assert.equal(await exists(custom), false); assert.deepEqual(await snapshot(f.home), before);
});

for (const mode of [[], ["--delete"]]) {
  for (const scenario of ["source", "home", "root", "duplicate", "nested", "symlink", "unrecognized", "active-home", "active-agent", "active-gentle"] as const) {
    test(`${mode.length ? "delete" : "archive"} refuses ${scenario} before mutating any lane`, async () => {
      const f = await fixture(), env: NodeJS.ProcessEnv = { ...f.env };
      if (scenario === "source") env.PI_LANE_GROK_HOME = f.source;
      if (scenario === "home") env.PI_LANE_GROK_HOME = f.home;
      if (scenario === "root") env.PI_LANE_GROK_HOME = "/";
      if (scenario === "duplicate") env.PI_LANE_GROK_HOME = f.lanes.opus;
      if (scenario === "nested") env.PI_LANE_GROK_HOME = join(f.lanes.opus, "nested");
      if (scenario === "symlink") { await rm(f.lanes.grok, { recursive: true }); await symlink(f.lanes.opus, f.lanes.grok); }
      if (scenario === "unrecognized") await rm(join(f.lanes.grok, "gentle-ai"), { recursive: true });
      if (scenario === "active-home") env.PI_HOME = f.lanes.gpt;
      if (scenario === "active-agent") env.PI_CODING_AGENT_DIR = join(f.lanes.gpt, "agent");
      if (scenario === "active-gentle") env.GENTLE_PI_CONFIG_HOME = join(f.lanes.gpt, "gentle-ai");
      const before = await snapshot(f.home), result = await run(env, [...mode, "--yes"]);
      assert.equal(result.code, 1); assert.equal(result.stdout, "");
      assert.match(result.stderr, /^uninstall-odd-lanes: /); assert.equal(result.stderr.trim().split("\n").length, 1);
      assert.deepEqual(await snapshot(f.home), before);
    });
  }
}

test("archive refuses a destination inside a lane before any writes", async () => {
  const f = await fixture(), before = await snapshot(f.home);
  const result = await run({ ...f.env, PI_LANE_ARCHIVE_ROOT: join(f.lanes.gpt, "archive") }, ["--yes"]);
  assert.equal(result.code, 1); assert.equal(result.stdout, ""); assert.match(result.stderr, /Archive root overlaps/);
  assert.deepEqual(await snapshot(f.home), before);
});

test("archive failure rolls back earlier moves without losing data", async () => {
  const f = await fixture(), before = await snapshot(f.home);
  const code = `import fs from 'node:fs/promises';import {syncBuiltinESMExports}from'node:module';const rename=fs.rename;let failed=false;fs.rename=async(a,b)=>{if(a===${JSON.stringify(f.lanes.gpt)}&&!failed){failed=true;throw Object.assign(new Error('injected second move failure'),{code:'EIO'})}return rename(a,b)};syncBuiltinESMExports();`;
  const preload = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
  const result = await run(f.env, ["--yes"], preload);
  assert.equal(result.code, 1); assert.equal(result.stdout, "");
  assert.match(result.stderr, /injected second move failure.*all moved homes restored/);
  assert.deepEqual(await snapshot(f.home), before);
});

test("help documents archive, deletion and explicit confirmation without reading HOME", async () => {
  const f = await fixture(), before = await snapshot(f.home), env = { ...f.env }; delete env.HOME;
  const result = await run(env, ["--help"]);
  assert.equal(result.code, 0); assert.equal(result.stderr, "");
  for (const option of ["--delete", "--yes", "--dry-run", "--help", "PI_LANE_ARCHIVE_ROOT"]) assert.ok(result.stdout.includes(option));
  assert.match(result.stdout, /cannot be undone/); assert.deepEqual(await snapshot(f.home), before);
});

for (const args of [["--unknown"], ["--yes", "--dry-run"]]) {
  test(`invalid flags ${JSON.stringify(args)} leave all data unchanged`, async () => {
    const f = await fixture(), before = await snapshot(f.home), result = await run(f.env, args);
    assert.equal(result.code, 1); assert.equal(result.stdout, ""); assert.match(result.stderr, /^uninstall-odd-lanes: /);
    assert.deepEqual(await snapshot(f.home), before);
  });
}
