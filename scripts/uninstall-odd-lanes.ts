import { chmod, lstat, mkdir, mkdtemp, realpath, rename, rm, rmdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Stats } from "node:fs";

const labels = ["opus", "gpt", "grok"] as const;
type Lane = { name: string; path: string; identity: Stats };
const help = `Usage: scripts/uninstall-odd-lanes.sh [--delete] [--yes | --dry-run]

Default: preview archival of the opus, gpt and grok lane homes.
  --yes      Apply the plan. Stop every Pi lane instance first.
  --delete   Permanently delete the homes instead of archiving them.
             Deletes sessions, credentials and configuration; cannot be undone.
  --dry-run  Preview only; cannot be combined with --yes.
  --help     Show this help.

Homes default to $HOME/.pi-opus, $HOME/.pi-gpt and $HOME/.pi-grok.
Overrides: PI_LANE_OPUS_HOME, PI_LANE_GPT_HOME, PI_LANE_GROK_HOME.
PI_LANE_SOURCE protects the source home (default: $HOME/.pi).
PI_LANE_ARCHIVE_ROOT changes the archive root (default: $HOME/.pi-lanes-archive).
Shared Pi symlink targets are not moved or deleted. Missing lanes are skipped.
Archival uses same-filesystem renames; cross-filesystem moves are refused.
Run from a separate terminal, not from inside a lane being removed.
`;

function message(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/[\r\n]+/g, " ");
}

async function optionalStat(path: string): Promise<Stats | undefined> {
  try { return await lstat(path); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

// Resolve missing paths through their closest existing ancestor, including parent symlinks.
async function physicalPath(path: string): Promise<string> {
  let current = resolve(path);
  const missing: string[] = [];
  while (!await optionalStat(current)) {
    const parent = dirname(current);
    if (parent === current) throw new Error(`Cannot resolve path ${path}.`);
    missing.unshift(basename(current)); current = parent;
  }
  return join(await realpath(current), ...missing);
}

function contains(parent: string, child: string): boolean {
  return parent === child || child.startsWith(parent.endsWith(sep) ? parent : `${parent}${sep}`);
}
function overlaps(a: string, b: string): boolean { return contains(a, b) || contains(b, a); }

async function stableLane(lane: Lane): Promise<void> {
  const current = await optionalStat(lane.path);
  if (!current?.isDirectory() || current.isSymbolicLink() || current.dev !== lane.identity.dev || current.ino !== lane.identity.ino) {
    throw new Error(`Lane ${lane.name} changed after preflight; refusing to operate on ${lane.path}.`);
  }
}

async function planLanes(env: NodeJS.ProcessEnv, deletion: boolean): Promise<{ lanes: Lane[]; archiveRoot: string }> {
  if (!env.HOME) throw new Error("HOME is not set.");
  const home = await physicalPath(env.HOME);
  const source = await physicalPath(env.PI_LANE_SOURCE || join(env.HOME, ".pi"));
  const configured = await Promise.all(labels.map(async name => {
    const raw = resolve(env[`PI_LANE_${name.toUpperCase()}_HOME`] || join(env.HOME!, `.pi-${name}`));
    const info = await optionalStat(raw);
    if (info?.isSymbolicLink()) throw new Error(`Lane ${name} home is a symlink; refusing to operate on ${raw}.`);
    const path = await physicalPath(raw);
    if (contains(path, home)) throw new Error(`Lane ${name} is HOME or its ancestor; refusing ${path}.`);
    if (overlaps(path, source)) throw new Error(`Lane ${name} overlaps the source home; refusing ${path}.`);
    return { name, path, identity: info };
  }));
  for (let i = 0; i < configured.length; i++) for (let j = i + 1; j < configured.length; j++) {
    if (overlaps(configured[i].path, configured[j].path)) throw new Error(`Lane homes overlap: ${configured[i].name} and ${configured[j].name}.`);
  }
  const lanes: Lane[] = [];
  for (const lane of configured) {
    if (!lane.identity) continue;
    if (!lane.identity.isDirectory()) throw new Error(`Lane ${lane.name} is not a directory: ${lane.path}.`);
    for (const child of ["agent", "gentle-ai"]) {
      const info = await optionalStat(join(lane.path, child));
      if (!info?.isDirectory() || info.isSymbolicLink()) throw new Error(`Lane ${lane.name} is not a recognized lane home: ${child}/ must be a real directory.`);
    }
    lanes.push({ ...lane, identity: lane.identity });
  }
  for (const [key, child] of [["PI_HOME", false], ["PI_CODING_AGENT_DIR", true], ["GENTLE_PI_AGENT_HOME", true], ["GENTLE_PI_CONFIG_HOME", true]] as const) {
    if (!env[key]) continue;
    const path = await physicalPath(child ? dirname(resolve(env[key]!)) : env[key]!);
    if (lanes.some(lane => lane.path === path)) throw new Error(`${key} points at a selected lane; stop Pi and run from a separate terminal.`);
  }
  // Delete mode does not inspect or modify archive storage.
  const archiveRoot = deletion ? "" : await physicalPath(env.PI_LANE_ARCHIVE_ROOT || join(env.HOME, ".pi-lanes-archive"));
  if (!deletion && (overlaps(archiveRoot, source) || configured.some(lane => overlaps(archiveRoot, lane.path)))) {
    throw new Error("Archive root overlaps the source or a lane home; choose a separate PI_LANE_ARCHIVE_ROOT.");
  }
  return { lanes, archiveRoot };
}

async function archiveLanes(lanes: Lane[], archiveRoot: string): Promise<string> {
  const rootExisted = Boolean(await optionalStat(archiveRoot));
  await mkdir(archiveRoot, { recursive: true, mode: 0o700 });
  const bundle = await mkdtemp(join(archiveRoot, "odd-lanes-"));
  await chmod(bundle, 0o700);
  const moved: Lane[] = [];
  try {
    const records = lanes.map(lane => ({ name: lane.name, originalPath: lane.path, archivedPath: join(bundle, lane.name) }));
    await writeFile(join(bundle, "manifest.json"), `${JSON.stringify({ kind: "jb-odd-models.lane-archive", version: 1, lanes: records }, null, 2)}\n`, { mode: 0o600 });
    await writeFile(join(bundle, "RESTORE.md"), `# Restore archived ODD lanes\n\nStop Pi. Read manifest.json for each originalPath and archivedPath.\nNever overwrite an existing lane home: move it aside intentionally first.\nMove each complete archived home back to its original path, then use its launcher.\nThe shared Pi installation is not included; symlinks still point to its original location.\n`, { mode: 0o600 });
    for (const lane of lanes) {
      await stableLane(lane);
      await rename(lane.path, join(bundle, lane.name));
      moved.push(lane);
    }
    return bundle;
  } catch (error) {
    const failures: string[] = [];
    for (const lane of [...moved].reverse()) {
      try {
        if (await optionalStat(lane.path)) throw new Error("original path now exists");
        await rename(join(bundle, lane.name), lane.path);
      } catch (cause) { failures.push(`${lane.name}: ${message(cause)}`); }
    }
    if (failures.length) throw new Error(`Archive failed (${message(error)}); rollback incomplete (${failures.join("; ")}). Keep ${bundle} and inspect manifest.json; archived data was not deleted.`);
    await rm(bundle, { recursive: true });
    if (!rootExisted) await rmdir(archiveRoot);
    throw new Error(`Archive failed (${message(error)}); all moved homes restored.`);
  }
}

async function deleteLanes(lanes: Lane[]): Promise<void> {
  const deleted: string[] = [];
  try {
    for (const lane of lanes) {
      await stableLane(lane);
      // fs.rm removes nested symlinks themselves, never their shared targets.
      await rm(lane.path, { recursive: true, force: false, maxRetries: 0 });
      deleted.push(lane.name);
    }
  } catch (error) {
    throw new Error(`Permanent deletion failed (${message(error)}); fully removed: ${deleted.join(", ") || "none"}. Other homes may be partially removed; inspect all selected paths. There is no backup or rollback.`);
  }
}

export async function uninstallOddLanes(args = process.argv.slice(2), env = process.env, log: (line: string) => void = console.log): Promise<void> {
  const allowed = new Set(["--delete", "--yes", "--dry-run", "--help"]);
  for (const arg of args) if (!allowed.has(arg)) throw new Error(`Unknown option: ${arg}. Use --help.`);
  if (args.includes("--yes") && args.includes("--dry-run")) throw new Error("--yes and --dry-run cannot be combined.");
  if (args.includes("--help")) { log(help.trimEnd()); return; }
  const deletion = args.includes("--delete");
  const { lanes, archiveRoot } = await planLanes(env, deletion);
  if (!lanes.length) { log(`No ODD lane homes found; nothing to ${deletion ? "delete" : "archive"}.`); return; }
  if (!args.includes("--yes")) {
    log(`Dry run: ${deletion ? "permanently delete" : "archive"} ODD lanes (no files changed).`);
    for (const lane of lanes) log(`${lane.name}: ${lane.path}`);
    if (!deletion) log(`Archive root: ${archiveRoot}`);
    log("Stop all Pi lane instances, then rerun with --yes.");
    return;
  }
  if (deletion) {
    await deleteLanes(lanes);
    log("Deleted ODD lanes permanently (no backup).");
    for (const lane of lanes) log(`${lane.name}: ${lane.path}`);
  } else {
    const bundle = await archiveLanes(lanes, archiveRoot);
    log(`Archived ODD lanes into ${bundle}.`);
    for (const lane of lanes) log(`${lane.name}: ${lane.path} -> ${join(bundle, lane.name)}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  uninstallOddLanes().catch(error => {
    console.error(`uninstall-odd-lanes: ${message(error)}`);
    process.exitCode = 1;
  });
}
