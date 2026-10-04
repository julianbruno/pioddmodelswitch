import { constants } from "node:fs";
import { access, chmod, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";

import { validateModelCatalog, type CatalogModel, type ModelCatalog } from "./catalog.ts";
import {
  isJsonObject,
  managedAgents,
  registeredProfileNames,
  RESERVED_COMMAND_NAMES,
  validateManifest,
  validateNamedProfile,
  type JsonObject,
  type ModelProfileEntry,
  type ModelProfilesManifest,
  type ValidatedModelProfile,
} from "./core.ts";

export const SAVE_OPTION = "Save";
export const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"] as const;

export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

export type ProfileEditorUI = {
  select(title: string, options: string[]): Promise<string | undefined>;
  confirm(title: string, message: string): Promise<boolean>;
  input(title: string, placeholder?: string): Promise<string | undefined>;
  notify(message: string, type?: "info" | "warning" | "error"): void;
};

export type ProfileEditorPaths = {
  gentleDir: string;
  manifestPath: string;
  catalogPath: string;
};

export type ProfileEditorIO = {
  writeFile?: (path: string, content: string) => Promise<void>;
  unlink?: (path: string) => Promise<void>;
};

export type ProfileEditorResult = {
  wrote: boolean;
  cancelled: boolean;
};

type FileSnapshot = {
  path: string;
  bytes: Buffer;
};

type EditorRegistry = {
  manifest: ModelProfilesManifest;
  profiles: Record<string, ValidatedModelProfile>;
  originalFiles: FileSnapshot[];
};

const MENU_VIEW = "View";
const MENU_EDIT = "Edit";
const MENU_CREATE = "Create";

export function agentChoice(agent: string, entry: ModelProfileEntry, inCatalog: boolean): string {
  return `${agent}: ${entry.model} (${entry.thinking})${inCatalog ? "" : " [not in catalog]"}`;
}

export function modelChoice(model: CatalogModel): string {
  return `${model.model} — ${model.name}`;
}

function isThinkingLevel(value: string): value is ThinkingLevel {
  return (THINKING_LEVELS as readonly string[]).includes(value);
}

function serialized(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function catalogHint(catalogPath: string): string {
  return `A valid model catalog is required to edit or create profiles. Generate one with \`npm run export:model-catalog\` and copy it to ${catalogPath}, or reinstall after generating config/model-catalog.json.`;
}

function assertWithin(root: string, candidate: string, label: string): string {
  const resolvedRoot = resolve(root);
  const resolvedCandidate = resolve(candidate);
  if (resolvedCandidate !== resolvedRoot && !resolvedCandidate.startsWith(`${resolvedRoot}${sep}`)) {
    throw new Error(`${label} must stay inside ${resolvedRoot}.`);
  }
  return resolvedCandidate;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function atomicWrite(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temp = join(dirname(path), `.${basename(path)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`);
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temp, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    await handle.writeFile(content, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temp, path);
    await chmod(path, 0o600);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await unlink(temp).catch(() => undefined);
    throw error;
  }
}

async function readJsonObject(path: string, label: string, originalFiles: FileSnapshot[]): Promise<JsonObject> {
  let parsed: unknown;
  try {
    const bytes = await readFile(path);
    parsed = JSON.parse(bytes.toString("utf8"));
    originalFiles.push({ path, bytes });
  } catch (error) {
    throw new Error(`${label} is not valid JSON (${path}): ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!isJsonObject(parsed)) throw new Error(`${label} must contain a JSON object (${path}).`);
  return parsed;
}

async function loadRegistry(paths: ProfileEditorPaths): Promise<EditorRegistry> {
  const originalFiles: FileSnapshot[] = [];
  const manifest = validateManifest(await readJsonObject(assertWithin(paths.gentleDir, paths.manifestPath, "Manifest path"), "Model profile manifest", originalFiles));
  const profiles: Record<string, ValidatedModelProfile> = Object.create(null);
  for (const registration of manifest.profiles) {
    const profilePath = assertWithin(paths.gentleDir, join(paths.gentleDir, registration.modelsFile), `Profile ${registration.name} path`);
    profiles[registration.name] = validateNamedProfile(
      await readJsonObject(profilePath, `Profile ${registration.name}`, originalFiles),
      manifest,
      registration.name,
    );
  }
  return { manifest, profiles, originalFiles };
}

async function assertRegistryUnchanged(originalFiles: readonly FileSnapshot[]): Promise<void> {
  for (const original of originalFiles) {
    let current: Buffer;
    try {
      current = await readFile(original.path);
    } catch (error) {
      const code = isJsonObject(error) && typeof error.code === "string" ? error.code : "";
      if (code !== "ENOENT") throw error;
      throw new Error(`Profile configuration changed since the editor opened (${original.path} is missing). Reopen the editor before saving; nothing was written.`);
    }
    if (!current.equals(original.bytes)) {
      throw new Error(`Profile configuration changed since the editor opened (${original.path}). Reopen the editor before saving; nothing was written.`);
    }
  }
}

async function loadCatalog(catalogPath: string): Promise<ModelCatalog> {
  let text: string;
  try {
    text = await readFile(catalogPath, "utf8");
  } catch (error) {
    const code = isJsonObject(error) && typeof error.code === "string" ? error.code : "";
    if (code === "ENOENT") throw new Error(catalogHint(catalogPath));
    throw error;
  }
  try {
    return validateModelCatalog(JSON.parse(text));
  } catch {
    throw new Error(`Invalid model catalog at ${catalogPath}. ${catalogHint(catalogPath)}`);
  }
}

function formatProfile(name: string, profile: ValidatedModelProfile, agents: readonly string[]): string {
  return [`Profile: ${name}`, ...agents.map((agent) => `${agent}: ${profile[agent].model} (${profile[agent].thinking})`)].join("\n");
}

function validateNewProfileName(name: string, manifest: ModelProfilesManifest, paths: ProfileEditorPaths): string | undefined {
  const reserved = new Set<string>([...RESERVED_COMMAND_NAMES, ...manifest.reservedCommandNames, ...registeredProfileNames(manifest)]);
  if (reserved.has(name) || reserved.has(name.toLowerCase())) {
    return `Profile name '${name}' is reserved or already registered.`;
  }
  let nextManifest: ModelProfilesManifest;
  try {
    nextManifest = validateManifest({
      ...manifest,
      profiles: [...manifest.profiles, { name, modelsFile: `models.${name}.json` }],
    });
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  const modelsFile = `models.${name}.json`;
  let profilePath: string;
  try {
    profilePath = assertWithin(paths.gentleDir, join(paths.gentleDir, modelsFile), "Profile path");
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  const forbidden = new Set([
    resolve(join(paths.gentleDir, "models.json")),
    resolve(paths.manifestPath),
    resolve(paths.catalogPath),
  ]);
  if (forbidden.has(profilePath) || nextManifest.profiles.some((profile) => profile.name !== name && resolve(join(paths.gentleDir, profile.modelsFile)) === profilePath)) {
    return `Profile file ${modelsFile} collides with a reserved configuration file.`;
  }
  return undefined;
}

async function persistProfile(options: {
  paths: ProfileEditorPaths;
  name: string;
  profile: ValidatedModelProfile;
  manifest: ModelProfilesManifest;
  originalFiles: readonly FileSnapshot[];
  register: boolean;
  io?: ProfileEditorIO;
}): Promise<void> {
  const modelsFile = `models.${options.name}.json`;
  const profilePath = assertWithin(options.paths.gentleDir, join(options.paths.gentleDir, modelsFile), "Profile path");
  const profileContent = serialized(options.profile);
  const write = options.io?.writeFile ?? atomicWrite;
  const remove = options.io?.unlink ?? unlink;
  if (options.register && await exists(profilePath)) throw new Error(`Profile file ${modelsFile} already exists.`);
  // Compare the same bytes we parsed at load, not normalized JSON. This is optimistic:
  // non-cooperating writers can still race between this check and the atomic rename.
  await assertRegistryUnchanged(options.originalFiles);
  await write(profilePath, profileContent);
  if (!options.register) return;
  try {
    await write(options.paths.manifestPath, serialized(options.manifest));
  } catch (error) {
    try {
      await remove(profilePath);
    } catch (rollbackError) {
      throw new Error(`${error instanceof Error ? error.message : String(error)}; rollback also failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
    }
    throw error;
  }
}

function catalogIdentities(catalog: ModelCatalog): Set<string> {
  return new Set(catalog.models.map((model) => model.model));
}

async function pickModel(ui: ProfileEditorUI, catalog: ModelCatalog, current?: string): Promise<string | undefined> {
  const choices = catalog.models.map(modelChoice);
  const currentChoice = catalog.models.find((model) => model.model === current);
  const options = currentChoice
    ? [modelChoice(currentChoice), ...choices.filter((choice) => choice !== modelChoice(currentChoice))]
    : choices;
  const selected = await ui.select("Model", options);
  if (!selected) return undefined;
  return catalog.models.find((model) => modelChoice(model) === selected)?.model;
}

async function pickThinking(ui: ProfileEditorUI, current?: string): Promise<ThinkingLevel | undefined> {
  const options = current && isThinkingLevel(current)
    ? [current, ...THINKING_LEVELS.filter((level) => level !== current)]
    : [...THINKING_LEVELS];
  const selected = await ui.select("Thinking level", options);
  if (!selected || !isThinkingLevel(selected)) return undefined;
  return selected;
}

async function editDraft(options: {
  ui: ProfileEditorUI;
  name: string;
  draft: ValidatedModelProfile;
  catalog: ModelCatalog;
  agents: readonly string[];
  register: boolean;
  manifest: ModelProfilesManifest;
  originalFiles: readonly FileSnapshot[];
  paths: ProfileEditorPaths;
  io?: ProfileEditorIO;
}): Promise<ProfileEditorResult> {
  const identities = catalogIdentities(options.catalog);
  const draft: ValidatedModelProfile = Object.fromEntries(
    options.agents.map((agent) => [agent, { ...options.draft[agent] }]),
  );

  while (true) {
    const choices = [
      ...options.agents.map((agent) => agentChoice(agent, draft[agent], identities.has(draft[agent].model))),
      SAVE_OPTION,
    ];
    const selected = await options.ui.select(`Edit ${options.name}`, choices);
    if (!selected) return { wrote: false, cancelled: true };
    if (selected === SAVE_OPTION) {
      const invalid = options.agents.filter((agent) => !identities.has(draft[agent].model) || !isThinkingLevel(draft[agent].thinking));
      if (invalid.length) {
        options.ui.notify(`Replace assignments not in the catalog before saving: ${invalid.join(", ")}`, "error");
        continue;
      }
      let profile: ValidatedModelProfile;
      try {
        profile = validateNamedProfile(draft, options.manifest, options.name);
      } catch (error) {
        options.ui.notify(error instanceof Error ? error.message : String(error), "error");
        continue;
      }
      const confirmed = await options.ui.confirm(
        "Save profile?",
        `Write ${options.register ? "new" : "updated"} profile ${options.name} with ${options.agents.length} agent mappings. The active profile will not change.`,
      );
      if (!confirmed) continue;
      const nextManifest = options.register
        ? validateManifest({
          ...options.manifest,
          profiles: [...options.manifest.profiles, { name: options.name, modelsFile: `models.${options.name}.json` }],
        })
        : options.manifest;
      try {
        await persistProfile({
          paths: options.paths,
          name: options.name,
          profile,
          manifest: nextManifest,
          originalFiles: options.originalFiles,
          register: options.register,
          io: options.io,
        });
      } catch (error) {
        options.ui.notify(error instanceof Error ? error.message : String(error), "error");
        return { wrote: false, cancelled: false };
      }
      options.ui.notify(`Saved profile ${options.name}. Active profile was not changed.`, "info");
      return { wrote: true, cancelled: false };
    }

    const agent = options.agents.find((name) => agentChoice(name, draft[name], identities.has(draft[name].model)) === selected);
    if (!agent) {
      options.ui.notify("Unknown editor choice.", "error");
      continue;
    }
    const model = await pickModel(options.ui, options.catalog, identities.has(draft[agent].model) ? draft[agent].model : undefined);
    if (!model) return { wrote: false, cancelled: true };
    const thinking = await pickThinking(options.ui, draft[agent].thinking);
    if (!thinking) return { wrote: false, cancelled: true };
    draft[agent] = { model, thinking };
  }
}

export async function runProfileEditor(
  ui: ProfileEditorUI,
  paths: ProfileEditorPaths,
  io?: ProfileEditorIO,
): Promise<ProfileEditorResult> {
  let registry: EditorRegistry;
  try {
    registry = await loadRegistry(paths);
  } catch (error) {
    ui.notify(error instanceof Error ? error.message : String(error), "error");
    return { wrote: false, cancelled: false };
  }

  const agents = managedAgents(registry.manifest);
  const names = registeredProfileNames(registry.manifest);
  const action = await ui.select("Profile editor", [MENU_VIEW, MENU_EDIT, MENU_CREATE]);
  if (!action) return { wrote: false, cancelled: true };

  if (action === MENU_VIEW) {
    const name = await ui.select("View profile", names);
    if (!name) return { wrote: false, cancelled: true };
    const profile = registry.profiles[name];
    if (!profile) {
      ui.notify(`Unknown profile: ${name}`, "error");
      return { wrote: false, cancelled: false };
    }
    ui.notify(formatProfile(name, profile, agents), "info");
    return { wrote: false, cancelled: false };
  }

  let catalog: ModelCatalog;
  try {
    catalog = await loadCatalog(paths.catalogPath);
  } catch (error) {
    ui.notify(error instanceof Error ? error.message : String(error), "error");
    return { wrote: false, cancelled: false };
  }

  if (action === MENU_EDIT) {
    const name = await ui.select("Edit profile", names);
    if (!name) return { wrote: false, cancelled: true };
    const profile = registry.profiles[name];
    if (!profile) {
      ui.notify(`Unknown profile: ${name}`, "error");
      return { wrote: false, cancelled: false };
    }
    return editDraft({
      ui,
      name,
      draft: profile,
      catalog,
      agents,
      register: false,
      manifest: registry.manifest,
      originalFiles: registry.originalFiles,
      paths,
      io,
    });
  }

  if (action !== MENU_CREATE) return { wrote: false, cancelled: true };

  const name = await ui.input("New profile name", "lowercase-name");
  if (!name) return { wrote: false, cancelled: true };
  const nameError = validateNewProfileName(name, registry.manifest, paths);
  if (nameError) {
    ui.notify(nameError, "error");
    return { wrote: false, cancelled: false };
  }
  if (await exists(join(paths.gentleDir, `models.${name}.json`))) {
    ui.notify(`Profile file models.${name}.json already exists.`, "error");
    return { wrote: false, cancelled: false };
  }
  const templateName = await ui.select("Template profile", names);
  if (!templateName) return { wrote: false, cancelled: true };
  const template = registry.profiles[templateName];
  if (!template) {
    ui.notify(`Unknown profile: ${templateName}`, "error");
    return { wrote: false, cancelled: false };
  }
  return editDraft({
    ui,
    name,
    draft: template,
    catalog,
    agents,
    register: true,
    manifest: registry.manifest,
    originalFiles: registry.originalFiles,
    paths,
    io,
  });
}
