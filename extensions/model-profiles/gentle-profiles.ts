// Gentle profile alignment for /jb:odd-models.
//
// gentle-pi freezes the `active` profile of <gentle-ai>/profiles.json when a parent
// session starts, and that snapshot outranks subagents.json when it launches
// subagents (gentle-pi lib/session-profile-freeze.ts). `/reload` keeps the snapshot.
// A switch that only rewrites models.json and subagents.json therefore leaves
// subagents on the previously active Gentle profile. This module keeps both Gentle
// layers in step with the applied ODD routing:
//   - profiles.json: the applied routing is saved under the profile name and marked
//     active, so new sessions freeze it. A missing store is never created, because
//     without one gentle-pi freezes nothing and subagents.json already routes.
//   - the invoking session: an explicit binding in gentle-pi's in-process store
//     (gentle-pi lib/session-profile-binding.ts), which outranks the frozen snapshot.
import { readFile } from "node:fs/promises";

import { isJsonObject, RETIRED_MANAGED_AGENTS, type JsonObject } from "./core.ts";
import { writeDurableFile } from "./transaction.ts";

export const GENTLE_PROFILES_KIND = "gentle-pi.agent_model_profiles";
export const GENTLE_PROFILES_VERSION = 1;
// gentle-pi resolves this key to one shared Map across every extension entrypoint.
const SESSION_BINDINGS_KEY = Symbol.for("gentle-pi:session-profile-bindings");
// gentle-pi drops profiles whose names fail this pattern or collide with prototype members.
const PROFILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const RESERVED_PROFILE_NAMES = new Set(["__proto__", "constructor", "prototype"]);
const ORCHESTRATOR_KEY = "orchestrator";

export type GentleRouting = Record<string, { model?: string; thinking?: string }>;
const THINKING_LEVELS = new Set(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);

/** Normalize both canonical and materialized routes using Gentle's accepted fields. */
export function normalizeGentleRouting(value: unknown, runtime = false): GentleRouting {
  if (!isJsonObject(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([agent, entry]) => {
    if ((RETIRED_MANAGED_AGENTS as readonly string[]).includes(agent)) return [];
    if (typeof entry === "string") return /^[A-Za-z0-9._~:@/+%-]+$/.test(entry.trim()) ? [[agent, { model: entry.trim() }]] : [];
    if (!isJsonObject(entry)) return [];
    const model = typeof entry.model === "string" && /^[A-Za-z0-9._~:@/+%-]+$/.test(entry.model.trim()) ? entry.model.trim() : undefined;
    // Saved profiles prefer valid thinking; materialized subagents prefer effort.
    const level = runtime ? entry.effort ?? entry.thinking
      : typeof entry.thinking === "string" && THINKING_LEVELS.has(entry.thinking) ? entry.thinking : entry.effort;
    const thinking = typeof level === "string" && THINKING_LEVELS.has(level) ? level : undefined;
    return model || thinking || Object.keys(entry).length === 0 ? [[agent, { ...(model ? { model } : {}), ...(thinking ? { thinking } : {}) }]] : [];
  }));
}

/** Preserve the caller's explicit selection, then its inherited startup snapshot. */
export function gentleSessionRouting(sessionId: string | undefined): GentleRouting | undefined {
  if (!sessionId) return undefined;
  const holder = globalThis as any;
  const explicit = holder[SESSION_BINDINGS_KEY]?.get(sessionId);
  if (explicit) return normalizeGentleRouting(explicit.modelProfiles);
  const inherited = holder[Symbol.for("gentle-pi:session-profile-freeze")]?.frozen?.get(sessionId)?.profile;
  return inherited ? normalizeGentleRouting(inherited.modelProfiles) : undefined;
}

export function gentleSessionProfileName(sessionId: string | undefined): string | undefined {
  if (!sessionId) return undefined;
  const holder = globalThis as any;
  return holder[SESSION_BINDINGS_KEY]?.get(sessionId)?.name
    ?? holder[Symbol.for("gentle-pi:session-profile-freeze")]?.frozen?.get(sessionId)?.profile?.name;
}

/** Merge project overrides field by field, just like Gentle's materialized config. */
export function mergeGentleRouting(base: GentleRouting, override: GentleRouting): GentleRouting {
  const merged = { ...base };
  for (const [agent, entry] of Object.entries(override)) merged[agent] = { ...merged[agent], ...entry };
  return merged;
}

export type GentleProfileStore = {
  path: string;
  content: string;
  store: JsonObject;
};

function notAStore(path: string): Error {
  return new Error(`${path} is not a ${GENTLE_PROFILES_KIND} v${GENTLE_PROFILES_VERSION} store; refusing to overwrite it.`);
}

/** Read and validate the Gentle profile store, or `undefined` when it does not exist. */
export async function readGentleProfileStore(path: string): Promise<GentleProfileStore | undefined> {
  let content: string;
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if (isJsonObject(error) && error.code === "ENOENT") return undefined;
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw notAStore(path);
  }
  if (!isJsonObject(parsed) || parsed.kind !== GENTLE_PROFILES_KIND || parsed.version !== GENTLE_PROFILES_VERSION || !isJsonObject(parsed.profiles)) {
    throw notAStore(path);
  }
  return { path, content, store: parsed };
}

export function assertGentleProfileName(name: string): void {
  if (!PROFILE_NAME_PATTERN.test(name) || RESERVED_PROFILE_NAMES.has(name)) {
    throw new Error(`Profile name '${name}' is not a valid Gentle profile name.`);
  }
}

/**
 * Save `routing` as profile `name` and mark it active. Returns whether the file
 * changed; an already aligned store is left byte- and mtime-identical.
 */
export async function alignGentleProfileStore(current: GentleProfileStore, name: string, routing: GentleRouting): Promise<boolean> {
  assertGentleProfileName(name);
  const profiles = current.store.profiles as JsonObject;
  const savedRouting = { ...normalizeGentleRouting(profiles[name]), ...routing };
  const next = { ...current.store, profiles: { ...profiles, [name]: savedRouting }, active: name };
  const content = `${JSON.stringify(next, null, 2)}\n`;
  if (content === current.content) return false;
  if (await readFile(current.path, "utf8") !== current.content) {
    throw new Error(`${current.path} changed during the profile switch; refusing to overwrite external bytes.`);
  }
  await writeDurableFile(current.path, content);
  return true;
}

/** Bind one parent session to `routing` the way an Enter in /gentle:profiles does. */
export function bindGentleSessionProfile(sessionId: string, name: string, routing: GentleRouting): void {
  const holder = globalThis as { [SESSION_BINDINGS_KEY]?: Map<string, unknown> };
  holder[SESSION_BINDINGS_KEY] ??= new Map();
  const modelProfiles = Object.fromEntries(
    Object.entries(routing)
      .filter(([agent]) => agent !== ORCHESTRATOR_KEY)
      .map(([agent, entry]) => [agent, { ...entry }]),
  );
  holder[SESSION_BINDINGS_KEY].set(sessionId, { name, modelProfiles });
}
