import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, chmod, copyFile, lstat, mkdir, open, readFile, rename, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

import {
  assertProfilesCoverManifest,
  deriveCanonicalProfileForSelection,
  deriveRuntimeConfigForSelection,
  isJsonObject,
  managedAgents,
  registeredProfileNames,
  validateManifest,
  withoutRetiredManagedAgents,
  validateProfileSet,
  type JsonObject,
  type ModelProfilesManifest,
  type ValidatedModelProfile,
} from "../extensions/model-profiles/core.ts";
import { validateModelCatalog } from "../extensions/model-profiles/catalog.ts";

type InstallOptions = {
  packageRoot?: string;
  piHome?: string;
  log?: (message: string) => void;
};

export type InstallResult = {
  changed: boolean;
  backupRoot?: string;
  changedFiles: string[];
  retiredFiles: string[];
  activeProfile?: string;
};

type Registry = {
  manifest: ModelProfilesManifest;
  profiles: Record<string, ValidatedModelProfile>;
  sourceText: Map<string, string>;
};

type Plan = {
  path: string;
  content: string;
  mode: number;
};

const configMode = 0o600;
const extensionMode = 0o644;
const helperFiles = ["core.ts", "transaction.ts", "catalog.ts", "editor.ts"];
const extensionFile = "odd-model-profiles.ts";
// Migration-only: the predecessor entrypoint registered the retired command. It is moved into the
// install backup only when its bytes equal a released package version (SHA-256 of commits 484fd80,
// 788a582, c538441, 1b55b8a, ce683b6); any other file is treated as user-owned and stops the install.
const legacyExtensionFile = "sdd-model-profiles.ts";
const legacyExtensionSha256 = new Set([
  "826a41621ec030eac47ce70e64e0d2fc7dbc80333ca86aed711fa07191e508f4",
  "ed0fecdd96b8cf2e8cdf613f5096c45a91116cfa396e6e8caaa950ff74a7a6fb",
  "6e9bc154b0aebb018adeaff6ee60101f53752b2ac86d53e33fd8b6b256a72790",
  "459d5b41c5a63719b9765a9c22f1d038f153ea9f89b5186f000049d79931a75a",
  "31993351ba029c0dacb83c204e0de6480bc75b8dacafa6a10a1746b818a405a4",
]);

function fail(message: string): never {
  throw new Error(message);
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function assertInside(root: string, candidate: string, label: string): string {
  const resolvedRoot = resolve(root);
  const resolvedCandidate = resolve(candidate);
  if (resolvedCandidate !== resolvedRoot && !resolvedCandidate.startsWith(`${resolvedRoot}${sep}`)) {
    fail(`${label} must stay inside ${resolvedRoot}.`);
  }
  return resolvedCandidate;
}

function parseJsonObject(text: string, label: string, path: string): JsonObject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    fail(`${label} is not valid JSON (${path}): ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isJsonObject(parsed)) fail(`${label} must contain a JSON object (${path}).`);
  return parsed;
}

async function readText(path: string, label: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    const code = isJsonObject(error) && typeof error.code === "string" ? error.code : "";
    if (code === "ENOENT") fail(`Package asset is missing: ${label}`);
    throw error;
  }
}

async function readOptionalJson(path: string, label: string): Promise<JsonObject | undefined> {
  if (!await exists(path)) return undefined;
  return parseJsonObject(await readFile(path, "utf8"), label, path);
}

async function loadRegistry(packageRoot: string): Promise<Registry> {
  const configDir = assertInside(packageRoot, join(packageRoot, "config"), "Config directory");
  const sourceText = new Map<string, string>();
  const manifestPath = join(configDir, "model-profiles.manifest.json");
  const manifestText = await readText(manifestPath, "config/model-profiles.manifest.json");
  sourceText.set("config/model-profiles.manifest.json", manifestText);
  const manifest = validateManifest(parseJsonObject(manifestText, "Model profile manifest", manifestPath));

  const profileInputs: JsonObject = {};
  for (const registration of manifest.profiles) {
    const relativePath = `config/${registration.modelsFile}`;
    const profilePath = assertInside(configDir, join(configDir, registration.modelsFile), `Profile ${registration.name} path`);
    const profileText = await readText(profilePath, relativePath);
    sourceText.set(relativePath, profileText);
    profileInputs[registration.name] = parseJsonObject(profileText, `Profile ${registration.name}`, profilePath);
  }
  const profiles = validateProfileSet(profileInputs, manifest);
  assertProfilesCoverManifest(profiles, manifest);
  return { manifest, profiles, sourceText };
}

async function loadCopyAssets(packageRoot: string): Promise<Map<string, string>> {
  const assets = new Map<string, string>();
  assets.set(`extensions/${extensionFile}`, await readText(join(packageRoot, "extensions", extensionFile), `extensions/${extensionFile}`));
  for (const helper of helperFiles) {
    const relativePath = `extensions/model-profiles/${helper}`;
    assets.set(relativePath, await readText(join(packageRoot, "extensions", "model-profiles", helper), relativePath));
  }
  const catalogRelative = "config/model-catalog.json";
  const catalogPath = join(packageRoot, catalogRelative);
  if (await exists(catalogPath)) {
    const catalogText = await readText(catalogPath, catalogRelative);
    validateModelCatalog(parseJsonObject(catalogText, "Model catalog", catalogPath));
    assets.set(catalogRelative, catalogText);
  }
  return assets;
}

function serialized(value: JsonObject): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function assertRuntimeBase(runtime: JsonObject | undefined, runtimePath: string): JsonObject {
  if (!runtime) return {};
  if (runtime.model_profiles !== undefined && !isJsonObject(runtime.model_profiles)) {
    fail(`${runtimePath}.model_profiles must be a JSON object before it can be merged.`);
  }
  return runtime;
}

function entryMatches(value: unknown, expected: { model: string; thinking: string }): boolean {
  return isJsonObject(value) && value.model === expected.model && value.thinking === expected.thinking;
}

// Keep the user's registered selection across reinstalls; fall back to the default only when the
// existing canonical mappings match no registered profile.
function selectInstallProfile(registry: Registry, canonicalBase: JsonObject | undefined): { name: string; preserved: boolean } {
  const { manifest, profiles } = registry;
  if (!profiles[manifest.defaultProfile]) fail(`Default profile '${manifest.defaultProfile}' is not available.`);
  if (!canonicalBase) return { name: manifest.defaultProfile, preserved: false };
  const candidates = [manifest.defaultProfile, ...registeredProfileNames(manifest).filter((name) => name !== manifest.defaultProfile)];
  for (const name of candidates) {
    const derived = deriveCanonicalProfileForSelection(name, profiles, manifest);
    if (managedAgents(manifest).every((agent) => entryMatches(canonicalBase[agent], derived[agent]))) return { name, preserved: true };
  }
  return { name: manifest.defaultProfile, preserved: false };
}

function planInstall(options: {
  piHome: string;
  registry: Registry;
  copyAssets: Map<string, string>;
  profileName: string;
  canonicalBase?: JsonObject;
  runtimeBase?: JsonObject;
}): Plan[] {
  const gentleDir = join(options.piHome, "gentle-ai");
  const extensionDir = join(options.piHome, "agent", "extensions");
  const canonical = {
    ...withoutRetiredManagedAgents(options.canonicalBase ?? {}),
    ...deriveCanonicalProfileForSelection(options.profileName, options.registry.profiles, options.registry.manifest),
  };
  const runtime = deriveRuntimeConfigForSelection(
    options.profileName,
    options.registry.profiles,
    options.registry.manifest,
    assertRuntimeBase(options.runtimeBase, join(options.piHome, "agent", "subagents.json")),
  );

  const plans: Plan[] = [
    { path: join(gentleDir, "model-profiles.manifest.json"), content: options.registry.sourceText.get("config/model-profiles.manifest.json")!, mode: configMode },
    { path: join(gentleDir, "models.json"), content: serialized(canonical), mode: configMode },
    { path: join(options.piHome, "agent", "subagents.json"), content: serialized(runtime), mode: configMode },
    { path: join(extensionDir, extensionFile), content: options.copyAssets.get(`extensions/${extensionFile}`)!, mode: extensionMode },
  ];

  for (const registration of options.registry.manifest.profiles) {
    plans.push({ path: join(gentleDir, registration.modelsFile), content: options.registry.sourceText.get(`config/${registration.modelsFile}`)!, mode: configMode });
  }
  for (const helper of helperFiles) {
    plans.push({ path: join(extensionDir, "model-profiles", helper), content: options.copyAssets.get(`extensions/model-profiles/${helper}`)!, mode: extensionMode });
  }
  const catalogText = options.copyAssets.get("config/model-catalog.json");
  if (catalogText !== undefined) {
    plans.push({ path: join(gentleDir, "model-catalog.json"), content: catalogText, mode: configMode });
  }
  return plans;
}

async function assertNoUnresolvedTransaction(piHome: string): Promise<void> {
  const journalDir = join(piHome, "gentle-ai", ".model-profiles-transactions");
  if (!await exists(journalDir)) return;
  const activePath = join(journalDir, "active.json");
  const lockPath = join(journalDir, "lock.json");
  if (await exists(activePath)) {
    fail("Model profile transaction state is unresolved; run /jb-odd-models recover before installing.");
  }
  if (await exists(lockPath)) {
    fail("Model profile transaction lock is present; wait for the switch/undo process or run recover before installing.");
  }
}

async function atomicWrite(path: string, content: string, mode: number): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = join(dirname(path), `.${basename(path)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`);
  let handle;
  try {
    handle = await open(temp, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, mode);
    await handle.writeFile(content, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temp, path);
    await chmod(path, mode);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    throw error;
  }
}

async function changedPlans(plans: Plan[]): Promise<Array<Plan & { existed: boolean }>> {
  const changed: Array<Plan & { existed: boolean }> = [];
  for (const plan of plans) {
    let current: string | undefined;
    try {
      current = await readFile(plan.path, "utf8");
    } catch (error) {
      const code = isJsonObject(error) && typeof error.code === "string" ? error.code : "";
      if (code !== "ENOENT") throw error;
    }
    if (current !== plan.content) changed.push({ ...plan, existed: current !== undefined });
  }
  return changed;
}

function sha256(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

async function inspectLegacyExtension(piHome: string): Promise<{ path: string; digest: string } | undefined> {
  const path = join(piHome, "agent", "extensions", legacyExtensionFile);
  let info;
  try {
    info = await lstat(path);
  } catch (error) {
    const code = isJsonObject(error) && typeof error.code === "string" ? error.code : "";
    if (code === "ENOENT") return undefined;
    throw error;
  }
  if (!info.isFile()) fail(`Legacy extension ${path} is not a regular file; review it and move it out of agent/extensions before installing.`);
  const digest = sha256(await readFile(path));
  if (!legacyExtensionSha256.has(digest)) {
    fail(`Legacy extension ${path} does not match a released package version, so ownership is uncertain; review it and move it out of agent/extensions before installing.`);
  }
  return { path, digest };
}

async function retireLegacyExtension(piHome: string, backupRoot: string, legacy: { path: string; digest: string }): Promise<void> {
  if (sha256(await readFile(legacy.path)) !== legacy.digest) fail(`Legacy extension ${legacy.path} changed during install; nothing was retired.`);
  const target = join(backupRoot, relative(piHome, legacy.path));
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  await rename(legacy.path, target);
}

async function backupChanged(
  piHome: string,
  changed: Array<Plan & { existed: boolean }>,
  legacy: { path: string } | undefined,
): Promise<string | undefined> {
  const existing = changed.filter((plan) => plan.existed);
  if (!existing.length && !legacy) return undefined;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupRoot = join(piHome, "backups", `jb-odd-models-${stamp}-${process.pid}`);
  await mkdir(backupRoot, { recursive: true, mode: 0o700 });
  for (const plan of existing) {
    const rel = relative(piHome, plan.path);
    if (rel.startsWith("..") || rel === "") fail(`Refusing to back up path outside PI_HOME: ${plan.path}`);
    const backup = join(backupRoot, rel);
    await mkdir(dirname(backup), { recursive: true, mode: 0o700 });
    await copyFile(plan.path, backup);
  }
  const legacyNote = legacy
    ? `${relative(piHome, legacy.path)} is the retired predecessor extension, moved here by the installer; restoring it loads the retired command next to /jb-odd-models.\n`
    : "";
  await writeFile(join(backupRoot, "RESTORE.txt"), `Copy the saved files back to the same relative paths under PI_HOME. Files absent from this backup were created by the installer.\n${legacyNote}`, "utf8");
  return backupRoot;
}

async function validatePiHome(piHome: string): Promise<void> {
  const agent = join(piHome, "agent");
  const info = await stat(agent).catch((error) => {
    const code = isJsonObject(error) && typeof error.code === "string" ? error.code : "";
    if (code === "ENOENT") fail(`Pi agent directory not found at ${agent}. Install Gentle Pi first, or set PI_HOME to its Pi home.`);
    throw error;
  });
  if (!info.isDirectory()) fail(`Pi agent path is not a directory: ${agent}`);
}

export async function installModelProfiles(input: InstallOptions = {}): Promise<InstallResult> {
  const packageRoot = resolve(input.packageRoot ?? join(dirname(fileURLToPath(import.meta.url)), ".."));
  const piHome = resolve(input.piHome ?? process.env.PI_HOME ?? join(process.env.HOME ?? "", ".pi"));
  if (!piHome || piHome === resolve(".pi")) fail("Neither HOME nor PI_HOME is set. Set one before installing.");
  const log = input.log ?? console.log;

  await validatePiHome(piHome);
  const registry = await loadRegistry(packageRoot);
  const copyAssets = await loadCopyAssets(packageRoot);
  await assertNoUnresolvedTransaction(piHome);

  const canonicalPath = join(piHome, "gentle-ai", "models.json");
  const runtimePath = join(piHome, "agent", "subagents.json");
  const canonicalBase = await readOptionalJson(canonicalPath, "Active canonical profile");
  const runtimeBase = await readOptionalJson(runtimePath, "Runtime configuration");
  const legacy = await inspectLegacyExtension(piHome);
  const selection = selectInstallProfile(registry, canonicalBase);
  const plans = planInstall({ piHome, registry, copyAssets, profileName: selection.name, canonicalBase, runtimeBase });
  for (const plan of plans) assertInside(piHome, plan.path, "Install target");

  const changed = await changedPlans(plans);
  if (!changed.length && !legacy) {
    log(`jb-odd-models is already installed in ${piHome}; no files changed.`);
    return { changed: false, changedFiles: [], retiredFiles: [], activeProfile: selection.name };
  }

  const backupRoot = await backupChanged(piHome, changed, legacy);
  if (legacy) await retireLegacyExtension(piHome, backupRoot!, legacy);
  for (const plan of changed) await atomicWrite(plan.path, plan.content, plan.mode);

  log(`Installed jb-odd-models into ${piHome}.`);
  if (selection.preserved) log(`Active profile kept: ${selection.name}.`);
  else if (canonicalBase) log(`Existing mappings matched no registered profile; activated default ${selection.name}. Previous files are in the backup.`);
  else log(`Active profile: ${selection.name}.`);
  if (legacy) log(`Retired predecessor extension moved to backup: ${relative(piHome, legacy.path)}`);
  if (backupRoot) log(`Backups: ${backupRoot}`);
  log("Restart Pi, then run /jb-odd-models status.");
  return {
    changed: true,
    backupRoot,
    changedFiles: changed.map((plan) => plan.path),
    retiredFiles: legacy ? [legacy.path] : [],
    activeProfile: selection.name,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  installModelProfiles({ packageRoot: process.env.PACKAGE_ROOT, piHome: process.env.PI_HOME }).catch((error) => {
    console.error(`jb-odd-models installer: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
