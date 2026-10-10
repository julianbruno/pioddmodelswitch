import { constants } from "node:fs";
import { access, chmod, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";

// Plain allowlisted metadata only: SDK models never enter drafts or persistence.
export type EditorModel = {
  provider: string;
  id: string;
  model: string;
  name: string;
  reasoning: boolean;
  thinkingLevelMap?: Record<string, string | number | null>;
};
export type ProfileEditorModelRegistry = {
  getAvailable(): unknown | Promise<unknown>;
  getError?(): string | undefined;
  getRegisteredNativeProvider?(provider: string): unknown;
  getRegisteredProviderConfig?(provider: string): unknown;
};
type ModelCatalog = { models: EditorModel[] };
import {
  isJsonObject,
  isModelIdentifier,
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

import { balanceAvailableModels, buildBalanceRequest, consultBalance, consultationOptions, verifyProviderCap, type BalanceConsultation, type BalanceCriteria } from "./balancing.ts";

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
  return `${agent}: ${entry.model} (${entry.thinking})${inCatalog ? "" : " [unavailable live model]"}`;
}

export function modelChoice(model: Pick<EditorModel, "model" | "name">): string {
  return `${model.model} — ${model.name}`;
}

function isThinkingLevel(value: string): value is ThinkingLevel {
  return (THINKING_LEVELS as readonly string[]).includes(value);
}

function serialized(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function supportedThinking(model: EditorModel): string[] {
  if (!model.reasoning) return ["off"];
  const map = model.thinkingLevelMap;
  const levels = [...THINKING_LEVELS, ...Object.keys(map ?? {}).filter((level) => !isThinkingLevel(level))];
  return levels.filter((level) => {
    if (map && Object.hasOwn(map, level) && map[level] === null) return false;
    if (["low", "medium", "high"].includes(level)) return true;
    return !!map && Object.hasOwn(map, level) && map[level] !== null && map[level] !== undefined;
  });
}

export function normalizeAvailableModels(value: unknown): EditorModel[] {
  if (!Array.isArray(value) || !value.length) throw new Error("No live models available.");
  const identities = new Set<string>();
  return value.map((raw) => {
    if (!isJsonObject(raw) || typeof raw.provider !== "string" || !raw.provider.trim() ||
        raw.provider !== raw.provider.trim() || raw.provider.includes("/") ||
        typeof raw.id !== "string" || !raw.id.trim() || raw.id !== raw.id.trim()) {
      throw new Error("Invalid live model identity.");
    }
    const model = `${raw.provider}/${raw.id}`;
    if (!isModelIdentifier(model)) throw new Error("Invalid live model identity.");
    if (identities.has(model)) throw new Error("Duplicate live model identity.");
    identities.add(model);
    const thinkingLevelMap: Record<string, string | number | null> = Object.create(null);
    if (isJsonObject(raw.thinkingLevelMap)) {
      for (const [level, mapped] of Object.entries(raw.thinkingLevelMap)) {
        if (level && level === level.trim() &&
            (mapped === null || typeof mapped === "string" || (typeof mapped === "number" && Number.isFinite(mapped)))) {
          thinkingLevelMap[level] = mapped;
        }
      }
    }
    return {
      provider: raw.provider, id: raw.id, model,
      name: typeof raw.name === "string" && raw.name.trim() ? raw.name : raw.id,
      reasoning: raw.reasoning === true,
      thinkingLevelMap,
    };
  });
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

async function loadAvailable(registry?: ProfileEditorModelRegistry): Promise<ModelCatalog> {
  if (!registry || typeof registry.getAvailable !== "function" || registry.getError?.()) {
    throw new Error("Live Pi model registry unavailable.");
  }
  // Installed extensions expose a synchronous facade; await also accepts async adapters.
  return { models: normalizeAvailableModels(await registry.getAvailable()) };
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

async function pickThinking(ui: ProfileEditorUI, model: EditorModel, current: string): Promise<string | undefined> {
  const supported = supportedThinking(model);
  const preserved = `${current} [unsupported; preserve]`;
  const options = supported.includes(current)
    ? [current, ...supported.filter((level) => level !== current)]
    : [preserved, ...supported];
  const selected = await ui.select("Thinking level", options);
  if (selected === preserved) return current;
  return selected && supported.includes(selected) ? selected : undefined;
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
  const assignmentChoice = (agent: string, entry: ModelProfileEntry): string => {
    const model = options.catalog.models.find((model) => model.model === entry.model);
    return agentChoice(agent, entry, identities.has(entry.model)) +
      (model && !supportedThinking(model).includes(entry.thinking) ? " [unsupported thinking]" : "");
  };
  const draft: ValidatedModelProfile = Object.fromEntries(
    options.agents.map((agent) => [agent, { ...options.draft[agent] }]),
  );

  while (true) {
    const choices = [
      ...options.agents.map((agent) => assignmentChoice(agent, draft[agent])),
      SAVE_OPTION,
    ];
    const selected = await options.ui.select(`Edit ${options.name}`, choices);
    if (!selected) return { wrote: false, cancelled: true };
    if (selected === SAVE_OPTION) {
      const invalid = options.agents.filter((agent) => {
        const model = options.catalog.models.find((model) => model.model === draft[agent].model);
        return !model || !supportedThinking(model).includes(draft[agent].thinking);
      });
      if (invalid.length) {
        options.ui.notify(`Replace unavailable model or unsupported thinking assignments before saving: ${invalid.join(", ")}`, "error");
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

    const agent = options.agents.find((name) => assignmentChoice(name, draft[name]) === selected);
    if (!agent) {
      options.ui.notify("Unknown editor choice.", "error");
      continue;
    }
    const model = await pickModel(options.ui, options.catalog, identities.has(draft[agent].model) ? draft[agent].model : undefined);
    if (!model) return { wrote: false, cancelled: true };
    const selectedModel = options.catalog.models.find((entry) => entry.model === model)!;
    const thinking = await pickThinking(options.ui, selectedModel, draft[agent].thinking);
    if (!thinking) return { wrote: false, cancelled: true };
    draft[agent] = { model, thinking };
  }
}

export async function runProfileEditor(
  ui: ProfileEditorUI,
  paths: ProfileEditorPaths,
  io?: ProfileEditorIO,
  modelRegistry?: ProfileEditorModelRegistry,
  consultation?: BalanceConsultation,
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
  const action = await ui.select("Profile editor", [MENU_VIEW, MENU_EDIT, MENU_CREATE, "Balance"]);
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
    catalog = await loadAvailable(modelRegistry);
  } catch {
    // Registry failures can contain auth/configuration details; never echo them.
    ui.notify("Live Pi model registry is missing, empty, invalid, or failed. Edit/Create/Balance unavailable; nothing was written. No file catalog fallback. View remains available.", "error");
    return { wrote: false, cancelled: false };
  }

  if (action === "Balance") {
    try {
      if (!consultation) throw new Error("Balance requires a supported interactive consultation UI.");
      const referenceName = await ui.select("Balance reference profile", names);
      if (!referenceName) return { wrote: false, cancelled: true };
      const reference = registry.profiles[referenceName];
      if (!reference) throw new Error("Unknown reference profile.");
      const criteria: BalanceCriteria = { priority: "balanced" };
      const mode = await ui.select("Balance criteria", ["Automatic balanced defaults", "Customize"]);
      if (!mode) return { wrote: false, cancelled: true };
      if (mode === "Customize") {
        const priority = await ui.select("Priority", ["balanced", "quality", "budget", "latency"]);
        if (!priority) return { wrote: false, cancelled: true };
        criteria.priority = priority as BalanceCriteria['priority'];
        const taskRisk = await ui.input("Optional task/risk context", "Leave empty for defaults");
        if (taskRisk === undefined) return { wrote: false, cancelled: true };
        if (taskRisk.trim()) criteria.taskRisk = taskRisk;
      } else if (mode !== "Automatic balanced defaults") throw new Error("Unknown criteria choice.");
      // Capture once at the consultation boundary, not when the editor opened.
      const current = consultation.capture();
      const captured = consultationOptions(current.model, current.thinking);
      verifyProviderCap(String(captured.model.provider), modelRegistry ?? {});
      const identity = `${captured.model.provider}/${captured.model.id}`;
      const fresh = await loadAvailable(modelRegistry);
      const request = buildBalanceRequest({
        models: balanceAvailableModels(fresh.models),
        roles: agents.map(role => ({ role, description: role === "orchestrator"
          ? "Coordinate task planning and implementation decisions."
          : /review|judge/.test(role) ? "Independently assess correctness and implementation risks."
          : "Perform the assigned development or verification role with appropriate effort." })),
        reference, current: { model: identity, thinking: current.thinking }, criteria,
      });
      const consent = await ui.confirm("Consult current Pi model?", [
        `One consultation using CURRENT ${identity} (thinking ${current.thinking}); provider ${captured.model.provider}. Possible provider cost.`,
        "Sent data: allowlisted available model identities/names/reasoning capabilities; reference role assignments and fixed descriptions; priority and optional task/risk criteria; current model identity and thinking.",
        "No chat history, source, system prompts from your session, or credentials are sent as prompt data. Normal provider authentication is handled by Pi.",
        "No fallback or retry. Advisory recommendations, not benchmark evidence. Nothing is saved or activated by consultation.",
      ].join("\n"));
      if (!consent) return { wrote: false, cancelled: true };
      await assertRegistryUnchanged(registry.originalFiles);
      const proposal = await consultBalance(request, captured, consultation);
      await assertRegistryUnchanged(registry.originalFiles);
      const preview = ["Advisory proposal; no benchmark claims. Active profile remains unchanged.",
        ...proposal.diff.map(row => `${row.role}: ${row.before.model} (${row.before.thinking}) -> ${row.after.model} (${row.after.thinking})\nRationale: ${row.rationale}`)].join("\n");
      if (!await ui.confirm("Balance preview — continue to named save?", preview)) return { wrote: false, cancelled: true };
      // Re-prompt on invalid names: the validated proposal was already paid for, so never re-infer.
      let name: string | undefined;
      while (true) {
        name = await ui.input("New balanced profile name", "lowercase-name");
        if (!name) return { wrote: false, cancelled: true };
        const nameError = validateNewProfileName(name, registry.manifest, paths) ??
          (await exists(join(paths.gentleDir, `models.${name}.json`)) ? `Profile file models.${name}.json already exists.` : undefined);
        if (!nameError) break;
        ui.notify(`Invalid profile name '${name}': use an unused safe lowercase name starting with a letter (a-z, 0-9, single '-' or '.' separators). ${nameError}`, "error");
      }
      if (!await ui.confirm("Save profile?", `Write new profile ${name} based on ${referenceName}. Active profile will not change.`)) return { wrote: false, cancelled: true };
      // Refresh both identities and capabilities after the final confirmation.
      const finalCatalog = await loadAvailable(modelRegistry);
      for (const agent of agents) {
        const entry = proposal.mapping[agent];
        const model = balanceAvailableModels(finalCatalog.models).find(model => model.model === entry.model);
        if (!model || !supportedThinking(model).includes(entry.thinking)) throw new Error("Balance model or thinking became unavailable; nothing was written.");
      }
      const profile = validateNamedProfile(proposal.mapping, registry.manifest, name);
      const nextManifest = validateManifest({ ...registry.manifest,
        profiles: [...registry.manifest.profiles, { name, modelsFile: `models.${name}.json` }] });
      await persistProfile({ paths, name, profile, manifest: nextManifest, originalFiles: registry.originalFiles, register: true, io });
      ui.notify(`Saved profile ${name}. Active profile was not changed.`, "info");
      return { wrote: true, cancelled: false };
    } catch (error) {
      // Provider errors can contain sensitive request/authentication details.
      const message = error instanceof Error && /^(Invalid balance|Balance |Profile configuration changed|Profile name|Profile file)/.test(error.message)
        ? error.message : "Balance consultation failed or is unavailable; nothing was written. No retry.";
      ui.notify(message, "error");
      return { wrote: false, cancelled: false };
    }
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
