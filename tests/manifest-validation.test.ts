import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import {
  RESERVED_COMMAND_NAMES,
  assertProfilesCoverManifest,
  deriveCanonicalProfile,
  deriveCanonicalProfileForSelection,
  deriveRuntimeConfig,
  deriveRuntimeConfigForSelection,
  deriveRuntimeModelProfiles,
  deriveRuntimeModelProfilesForSelection,
  managedAgents,
  registeredProfileNames,
  validateManifest,
  validateNamedProfile,
  validateProfileSet,
  type ModelProfileEntry,
  type ModelProfilesManifest,
  type ValidatedModelProfile,
} from "../extensions/model-profiles/core.ts";

const expectedOddAgents = ["gentle-ai-explore", "gentle-ai-worker", "gentle-ai-verify", "orchestrator", "jd-fix-agent"];
const expectedJudgeAgents = [
  "review-risk",
  "review-resilience",
  "review-readability",
  "review-reliability",
  "review-refuter",
  "review-validator",
  "jd-judge-a",
  "jd-judge-b",
];
const expectedAgents = [...expectedOddAgents, ...expectedJudgeAgents];
const expectedNonJudgeAgents = [...expectedOddAgents];
const roleExpansion: Record<string, string[]> = {
  orquestador: ["orchestrator"],
  razonamiento: ["gentle-ai-explore", "gentle-ai-verify", ...expectedJudgeAgents],
  codigo: ["gentle-ai-worker", "jd-fix-agent"],
  // The catalog keeps the lightweight role, but no managed ODD agent uses it.
  liviano: [],
};
const expectedOppositePairs: Record<string, string> = {
  "gpt-5.6-low-cost": "grok-low-cost",
  "gpt-5.6-recommended": "grok-recommended",
  "gpt-5.6-powerful": "grok-powerful",
  "gpt-astra-low-cost": "grok-low-cost",
  "gpt-astra-recommended": "grok-recommended",
  "gpt-astra-powerful": "grok-powerful",
  "gpt-astra-only-low-cost": "grok-low-cost",
  "gpt-astra-only-recommended": "grok-recommended",
  "gpt-astra-only-powerful": "grok-powerful",
  "grok-low-cost": "gpt-5.6-low-cost",
  "grok-recommended": "gpt-5.6-recommended",
  "grok-powerful": "gpt-5.6-powerful",
  openai: "grok",
  grok: "openai",
};

const luna = "openai/gpt-6-luna";
const sol = "openai/gpt-6.1-sol";
// Standalone GPT-6.1 lanes: Powerful substitutes Sol 6.1 for the unavailable Astra 6.1.
const gpt61Profiles = [
  { name: "gpt-6-1-lowcost", orchestrator: [luna, "medium"], reasoning: [sol, "medium"], code: [luna, "medium"], light: [luna, "medium"] },
  { name: "gpt-6-1-recommended", orchestrator: [sol, "medium"], reasoning: [sol, "medium"], code: [luna, "high"], light: [luna, "medium"] },
  { name: "gpt-6-1-powerful", orchestrator: [sol, "medium"], reasoning: [sol, "xhigh"], code: [sol, "high"], light: [luna, "high"] },
] as const;

type NamedProfilesCatalog = {
  schemaVersion: 1;
  roles: string[];
  profiles: Array<{
    name: string;
    roles: Record<string, ModelProfileEntry>;
  }>;
};

async function readJson(path: string): Promise<any> {
  return JSON.parse(await readFile(path, "utf8"));
}

async function packagedManifest(): Promise<ModelProfilesManifest> {
  return validateManifest(await readJson("config/model-profiles.manifest.json"));
}

async function packagedNamedProfiles(): Promise<NamedProfilesCatalog> {
  return await readJson("config/named-profiles.json");
}

async function packagedProfiles(manifest: ModelProfilesManifest): Promise<Record<string, ValidatedModelProfile>> {
  const inputs: Record<string, unknown> = {};
  for (const profile of manifest.profiles) {
    inputs[profile.name] = await readJson(join("config", profile.modelsFile));
  }
  return validateProfileSet(inputs, manifest);
}

function expectedFullProfile(namedProfile: NamedProfilesCatalog["profiles"][number]): ValidatedModelProfile {
  const entries: Array<[string, ModelProfileEntry]> = [];
  for (const [role, agents] of Object.entries(roleExpansion)) {
    for (const agent of agents) entries.push([agent, { ...namedProfile.roles[role] }]);
  }
  return Object.fromEntries(entries);
}

function validManifestPatch(patch: Record<string, unknown>): unknown {
  return {
    schemaVersion: 2,
    defaultProfile: "gpt-5.6-recommended",
    managedAgentGroups: {
      odd: expectedOddAgents,
    },
    reservedCommandNames: [...RESERVED_COMMAND_NAMES],
    oppositeProviderJudges: {
      enabled: true,
      agents: expectedJudgeAgents,
      profilePairs: {
        "gpt-5.6-recommended": "grok-recommended",
        "grok-recommended": "gpt-5.6-recommended",
      },
    },
    profiles: [
      { name: "gpt-5.6-recommended", modelsFile: "models.gpt-5.6-recommended.json" },
      { name: "grok-recommended", modelsFile: "models.grok-recommended.json" },
    ],
    ...patch,
  };
}

function validProfilePatch(patch: Record<string, unknown>): Record<string, unknown> {
  return {
    ...Object.fromEntries(expectedAgents.map((agent) => [agent, { model: "provider/model", thinking: "medium" }])),
    ...patch,
  };
}

test("package version is 1.5.0", async () => {
  assert.equal((await readJson("package.json")).version, "1.5.0");
});

test("claude-opus-5.5 has exact task-aware effort categories and one model", async () => {
  const manifest = await packagedManifest();
  const profile = (await packagedProfiles(manifest))["claude-opus-5.5"];
  const categories: Record<string, string[]> = {
    medium: ["gentle-ai-explore", "gentle-ai-worker", "jd-fix-agent", "orchestrator", "review-readability"],
    high: ["gentle-ai-verify", "review-risk", "review-resilience", "review-reliability", "review-refuter", "review-validator", "jd-judge-a", "jd-judge-b"],
  };
  assert.deepEqual(Object.keys(profile).sort(), managedAgents(manifest).sort());
  for (const [thinking, agents] of Object.entries(categories)) {
    assert.deepEqual(Object.entries(profile).filter(([, entry]) => entry.thinking === thinking).map(([agent]) => agent).sort(), agents.sort(), thinking);
  }
  assert.ok(Object.values(profile).every(({ model }) => model === "claude-bridge/claude-opus-5-5"));
  assert.ok(Object.values(profile).every(({ thinking }) => !["max", "xhigh", "minimal", "off"].includes(thinking)));
});

test("packaged manifest defaults to openaigentle and registers named profiles plus compatibility aliases", async () => {
  const manifest = await packagedManifest();
  const catalog = await packagedNamedProfiles();
  const namedProfileNames = catalog.profiles.map((profile) => profile.name);
  const expectedRegisteredNames = ["openai", "openaigentle", "openai6-1-gentle", "grok", "grok-4-7", ...namedProfileNames, "claude-opus-5.5", "claude-sep", "openai-sep", ...gpt61Profiles.map(({ name }) => name), "fable5.1", "open6.1revoopus5.5", "opus5.5revgpt6.1"];
  assert.ok(namedProfileNames.includes("gpt-5.5-powerful"));

  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.defaultProfile, "openaigentle");
  assert.deepEqual(manifest.managedAgentGroups, {
    odd: expectedOddAgents,
  });
  // Explicit legacy lists remain unchanged; built-in reservations apply independently.
  assert.deepEqual(manifest.reservedCommandNames, ["status", "list", "preview", "doctor", "undo", "recover"]);
  assert.deepEqual(manifest.oppositeProviderJudges, {
    enabled: true,
    agents: expectedJudgeAgents,
    profilePairs: expectedOppositePairs,
  });
  assert.deepEqual(manifest.profiles, expectedRegisteredNames.map((name) => ({ name, modelsFile: `models.${name}.json` })));
  assert.deepEqual(managedAgents(manifest), expectedAgents);
  assert.deepEqual(registeredProfileNames(manifest), expectedRegisteredNames);
});

test("manifests without configured opposite-provider judges preserve legacy managed coverage", () => {
  const legacyManifest = validateManifest({
    schemaVersion: 2,
    defaultProfile: "openai",
    managedAgentGroups: {
      odd: expectedOddAgents,
    },
    reservedCommandNames: [...RESERVED_COMMAND_NAMES],
    profiles: [
      { name: "openai", modelsFile: "models.openai.json" },
      { name: "grok", modelsFile: "models.grok.json" },
    ],
  });

  assert.deepEqual(legacyManifest.oppositeProviderJudges, { enabled: true, agents: [], profilePairs: {} });
  assert.deepEqual(managedAgents(legacyManifest), expectedNonJudgeAgents);

  const emptyJudgesManifest = validateManifest(validManifestPatch({ oppositeProviderJudges: { agents: [] } }));
  assert.deepEqual(emptyJudgesManifest.oppositeProviderJudges, { enabled: true, agents: [], profilePairs: {} });
  assert.deepEqual(managedAgents(emptyJudgesManifest), expectedNonJudgeAgents);
});

test("generated packaged named profiles equal role expansion from named-profiles.json", async () => {
  const manifest = await packagedManifest();
  const catalog = await packagedNamedProfiles();
  const profiles = await packagedProfiles(manifest);
  assertProfilesCoverManifest(profiles, manifest);

  for (const namedProfile of catalog.profiles) {
    assert.deepEqual(Object.keys(profiles[namedProfile.name]), expectedAgents);
    assert.deepEqual(profiles[namedProfile.name], expectedFullProfile(namedProfile));
  }

  assert.deepEqual(profiles.openai, profiles["gpt-5.6-recommended"]);
  assert.deepEqual(profiles.grok, profiles["grok-recommended"]);

  for (const profile of Object.values(profiles)) {
    for (const entry of Object.values(profile)) {
      assert.match(entry.model, /^[^/\s]+\/[^/\s]+$/);
      assert.equal(typeof entry.thinking, "string");
      assert.notEqual(entry.thinking, "");
      assert.equal(entry.thinking, entry.thinking.trim());
    }
  }
});

test("gpt-5.5-powerful keeps every managed agent on GPT-5.5 without opposite-provider judges", async () => {
  const manifest = await packagedManifest();
  const catalog = await packagedNamedProfiles();
  const named = catalog.profiles.find((profile) => profile.name === "gpt-5.5-powerful");
  assert.ok(named);
  const efforts = { orquestador: "medium", razonamiento: "xhigh", codigo: "high", liviano: "medium" };
  for (const [role, effort] of Object.entries(efforts)) {
    assert.deepEqual(named.roles[role], { model: "openai-codex/gpt-5.5", thinking: effort });
  }
  const profiles = await packagedProfiles(manifest);
  const expected = expectedFullProfile(named);
  assert.deepEqual(Object.keys(profiles[named.name]), expectedAgents);
  assert.deepEqual(profiles[named.name], expected);
  assert.equal(Object.hasOwn(manifest.oppositeProviderJudges.profilePairs, named.name), false);
  assert.deepEqual(deriveCanonicalProfileForSelection(named.name, profiles, manifest), expected);
  assert.deepEqual(deriveRuntimeModelProfilesForSelection(named.name, profiles, manifest),
    Object.fromEntries(Object.entries(expected).map(([agent, entry]) =>
      [agent, { model: "openai-codex/gpt-5.5", effort: entry.thinking }])));
});

test("openaigentle preserves the supplied GPT-6 mapping in canonical and runtime selections", async () => {
  const manifest = await packagedManifest();
  const profiles = await packagedProfiles(manifest);
  const expected = Object.fromEntries([
    ["orchestrator", { model: "openai-codex/gpt-6-sol", thinking: "medium" }],
    ["gentle-ai-explore", { model: "openai-codex/gpt-6-luna", thinking: "high" }],
    ...["gentle-ai-worker", "jd-fix-agent"].map((agent) =>
      [agent, { model: "openai-codex/gpt-6-sol", thinking: "low" }]),
    ...["gentle-ai-verify", ...expectedJudgeAgents].map((agent) =>
      [agent, { model: "openai-codex/gpt-6-sol", thinking: "high" }]),
  ]);

  assert.deepEqual(profiles.openaigentle, expected);
  assert.deepEqual(deriveCanonicalProfileForSelection(manifest.defaultProfile, profiles, manifest), expected);
  assert.deepEqual(deriveRuntimeModelProfilesForSelection(manifest.defaultProfile, profiles, manifest),
    Object.fromEntries(Object.entries(expected).map(([agent, entry]) =>
      [agent, { model: entry.model, effort: entry.thinking }])));
});

test("openai6-1-gentle uses registered OpenAI Sol and Luna routes and preserves all efforts", async () => {
  const manifest = await packagedManifest();
  const profiles = await packagedProfiles(manifest);
  const name = "openai6-1-gentle";
  const expected = Object.fromEntries(Object.entries(profiles.openaigentle).map(([agent, entry]) => [
    agent, { model: entry.model === "openai-codex/gpt-6-sol" ? "openai/gpt-6.1-sol" : "openai/gpt-6-luna", thinking: entry.thinking },
  ]));

  assert.equal(manifest.defaultProfile, "openaigentle");
  assert.equal(Object.hasOwn(manifest.oppositeProviderJudges.profilePairs, name), false);
  assert.deepEqual(Object.keys(profiles[name]), Object.keys(profiles.openaigentle));
  assert.equal(Object.values(profiles[name]).filter(({ model }) => model === "openai/gpt-6.1-sol").length, 12);
  assert.equal(Object.values(profiles[name]).filter(({ model }) => model === "openai/gpt-6-luna").length, 1);
  assert.ok(Object.values(profiles[name]).every(({ model }) => ["openai/gpt-6.1-sol", "openai/gpt-6-luna"].includes(model)));
  assert.deepEqual(profiles[name], expected);
  assert.deepEqual(deriveCanonicalProfileForSelection(name, profiles, manifest), expected);
  assert.deepEqual(deriveRuntimeModelProfilesForSelection(name, profiles, manifest),
    Object.fromEntries(Object.entries(expected).map(([agent, entry]) =>
      [agent, { model: entry.model, effort: entry.thinking }])));
});

test("grok-4-7 copies all grok agents and thinking while changing only the model", async () => {
  const manifest = await packagedManifest();
  const name = "grok-4-7";
  assert.deepEqual(manifest.profiles.find((profile) => profile.name === name), {
    name, modelsFile: "models.grok-4-7.json",
  });
  assert.equal(manifest.defaultProfile, "openaigentle");
  assert.deepEqual(manifest.oppositeProviderJudges.profilePairs, expectedOppositePairs);
  assert.equal(Object.hasOwn(manifest.oppositeProviderJudges.profilePairs, name), false);

  const profiles = await packagedProfiles(manifest);
  const profile = profiles[name];
  const expected = Object.fromEntries(Object.entries(profiles.grok).map(([agent, entry]) => [
    agent, { ...entry, model: "xai/grok-4.7" },
  ]));
  assert.equal(Object.keys(profile).length, 13);
  assert.deepEqual(Object.keys(profile), Object.keys(profiles.grok));
  assert.deepEqual(Object.keys(profile).sort(), expectedAgents.slice().sort());
  assert.deepEqual(profile, expected);
  for (const agent of expectedAgents) {
    assert.deepEqual(profile[agent], {
      model: "xai/grok-4.7",
      thinking: ["gentle-ai-worker", "jd-fix-agent"].includes(agent) ? "high" : "medium",
    });
  }
  assert.deepEqual(deriveCanonicalProfileForSelection(name, profiles, manifest), expected);
  assert.deepEqual(deriveRuntimeModelProfilesForSelection(name, profiles, manifest),
    Object.fromEntries(Object.entries(expected).map(([agent, entry]) => [
      agent, { model: entry.model, effort: entry.thinking },
    ])));
});

test("gpt-6-1 lanes are standalone, unpaired, and route every ODD role explicitly", async () => {
  const manifest = await packagedManifest();
  const profiles = await packagedProfiles(manifest);
  const catalog = await packagedNamedProfiles();
  assert.equal(manifest.defaultProfile, "openaigentle");
  for (const lane of gpt61Profiles) {
    const entry = ([model, thinking]: readonly [string, string]) => ({ model, thinking });
    const expected = Object.fromEntries([
      ["orchestrator", entry(lane.orchestrator)],
      ["gentle-ai-explore", entry(lane.light)],
      ...["gentle-ai-worker", "jd-fix-agent"].map((agent) => [agent, entry(lane.code)]),
      ...["gentle-ai-verify", ...expectedJudgeAgents].map((agent) => [agent, entry(lane.reasoning)]),
    ]);
    const file = await readJson(join("config", `models.${lane.name}.json`));
    assert.deepEqual(Object.keys(file).sort(), expectedAgents.slice().sort());
    assert.ok(Object.keys(file).every((agent) => !agent.startsWith("sdd-")));
    assert.deepEqual(profiles[lane.name], expected);
    assert.deepEqual(profiles[lane.name]["jd-fix-agent"], profiles[lane.name]["gentle-ai-worker"]);
    assert.equal(Object.hasOwn(manifest.oppositeProviderJudges.profilePairs, lane.name), false);
    assert.equal(catalog.profiles.some(({ name }) => name === lane.name), false);
    assert.deepEqual(deriveCanonicalProfileForSelection(lane.name, profiles, manifest), expected);
    assert.deepEqual(deriveRuntimeModelProfilesForSelection(lane.name, profiles, manifest),
      Object.fromEntries(Object.entries(expected).map(([agent, value]) => [agent, { model: value.model, effort: value.thinking }])));
  }
});

test("separate provider profiles inherit their baselines, override implementation routes, and stay unpaired", async () => {
  const manifest = await packagedManifest();
  const profiles = await packagedProfiles(manifest);
  const routes = [
    { name: "claude-sep", baseline: "claude-opus-5.5", overrides: ["gentle-ai-explore", "gentle-ai-worker", "jd-fix-agent"], entry: { model: "claude-bridge/claude-sonnet-5", thinking: "high" }, explicit: { "review-readability": { model: "claude-bridge/claude-opus-5-5", thinking: "high" } } },
    { name: "openai-sep", baseline: "openaigentle", overrides: ["gentle-ai-worker", "jd-fix-agent"], entry: { model: "openai-codex/gpt-6-sol", thinking: "medium" } },
  ];
  for (const { name, baseline, overrides, entry, explicit = {} } of routes) {
    const expected = { ...profiles[baseline], ...Object.fromEntries(overrides.map((agent) => [agent, entry])), ...explicit };
    assert.deepEqual(Object.keys(profiles[name]).sort(), expectedAgents.slice().sort());
    assert.deepEqual(profiles[name], expected);
    assert.equal(Object.hasOwn(manifest.oppositeProviderJudges.profilePairs, name), false);
    assert.deepEqual(deriveCanonicalProfileForSelection(name, profiles, manifest), expected);
    assert.deepEqual(deriveRuntimeModelProfilesForSelection(name, profiles, manifest),
      Object.fromEntries(Object.entries(expected).map(([agent, value]) => [agent, { model: value.model, effort: value.thinking }])));
  }
  for (const profile of Object.values(profiles)) {
    assert.deepEqual(profile["jd-fix-agent"], profile["gentle-ai-worker"]);
  }
});

test("claude-opus-5.5 is standalone, unpaired, and preserves its calibrated effort at runtime", async () => {
  const manifest = await packagedManifest();
  const profiles = await packagedProfiles(manifest);
  const expected = profiles["claude-opus-5.5"];
  assert.equal(Object.hasOwn(manifest.oppositeProviderJudges.profilePairs, "claude-opus-5.5"), false);
  assert.deepEqual(deriveCanonicalProfileForSelection("claude-opus-5.5", profiles, manifest), expected);
  assert.deepEqual(deriveRuntimeModelProfilesForSelection("claude-opus-5.5", profiles, manifest),
    Object.fromEntries(expectedAgents.map((agent) => [agent, {
      model: "claude-bridge/claude-opus-5-5", effort: expected[agent].thinking,
    }])));
  assert.equal(expected.orchestrator.thinking, "medium");
});

test("fable5.1 clones claude-opus-5.5 thinking on Fable, stays unpaired, and preserves effort at runtime", async () => {
  const manifest = await packagedManifest();
  const profiles = await packagedProfiles(manifest);
  const fable = "claude-bridge/claude-fable-5-1";
  const reference = profiles["claude-opus-5.5"];
  const expected = Object.fromEntries(expectedAgents.map((agent) => [agent, { model: fable, thinking: reference[agent].thinking }]));
  assert.deepEqual(Object.keys(profiles["fable5.1"]).sort(), expectedAgents.slice().sort());
  assert.deepEqual(profiles["fable5.1"], expected);
  assert.equal(Object.hasOwn(manifest.oppositeProviderJudges.profilePairs, "fable5.1"), false);
  assert.ok(!Object.values(manifest.oppositeProviderJudges.profilePairs).includes("fable5.1"));
  assert.deepEqual(deriveCanonicalProfileForSelection("fable5.1", profiles, manifest), expected);
  assert.deepEqual(deriveRuntimeModelProfilesForSelection("fable5.1", profiles, manifest),
    Object.fromEntries(expectedAgents.map((agent) => [agent, { model: fable, effort: reference[agent].thinking }])));
});

test("open6.1revoopus5.5 splits review and judges between Sol and Opus over openai6-1-gentle, unpaired", async () => {
  const manifest = await packagedManifest();
  const profiles = await packagedProfiles(manifest);
  const sol = "openai/gpt-6.1-sol";
  const opus = "claude-bridge/claude-opus-5-5";
  const base = profiles["openai6-1-gentle"];
  const solReview = ["review-risk", "review-reliability", "review-validator", "jd-judge-a"];
  const opusReview = ["review-resilience", "review-readability", "review-refuter", "jd-judge-b"];
  const overrides = Object.fromEntries([
    ...solReview.map((agent) => [agent, { model: sol, thinking: "high" }]),
    ...opusReview.map((agent) => [agent, { model: opus, thinking: "high" }]),
  ]);
  const expected = Object.fromEntries(expectedAgents.map((agent) => [agent, overrides[agent] ?? base[agent]]));
  const profile = profiles["open6.1revoopus5.5"];
  assert.deepEqual(Object.keys(profile).sort(), expectedAgents.slice().sort());
  assert.deepEqual(profile, expected);
  for (const agent of expectedAgents) assert.equal(profile[agent].thinking, base[agent].thinking, agent);
  for (const agent of expectedAgents.filter((agent) => !(agent in overrides))) assert.deepEqual(profile[agent], base[agent], agent);
  const reviewers = (model: string) => manifest.oppositeProviderJudges.agents.filter((agent) => agent.startsWith("review-") && profile[agent].model === model);
  assert.equal(reviewers(sol).length, 3);
  assert.equal(reviewers(opus).length, 3);
  assert.notEqual(profile["jd-judge-a"].model, profile["jd-judge-b"].model);
  assert.equal(Object.hasOwn(manifest.oppositeProviderJudges.profilePairs, "open6.1revoopus5.5"), false);
  assert.ok(!Object.values(manifest.oppositeProviderJudges.profilePairs).includes("open6.1revoopus5.5"));
  assert.deepEqual(deriveCanonicalProfileForSelection("open6.1revoopus5.5", profiles, manifest), expected);
  assert.deepEqual(deriveRuntimeModelProfilesForSelection("open6.1revoopus5.5", profiles, manifest),
    Object.fromEntries(Object.entries(expected).map(([agent, value]) => [agent, { model: value.model, effort: value.thinking }])));
});

test("opus5.5revgpt6.1 copies claude-opus-5.5 except a Sol jd-judge-b, unpaired", async () => {
  const manifest = await packagedManifest();
  const profiles = await packagedProfiles(manifest);
  const opus = "claude-bridge/claude-opus-5-5";
  const baseRaw = await readJson("config/models.claude-opus-5.5.json");
  const raw = await readJson("config/models.opus5.5revgpt6.1.json");
  // Same roles in the same file order; only jd-judge-b changes model.
  assert.deepEqual(Object.keys(raw), Object.keys(baseRaw));
  assert.deepEqual(raw, { ...baseRaw, "jd-judge-b": { model: sol, thinking: "high" } });
  const base = profiles["claude-opus-5.5"];
  const expected = Object.fromEntries(expectedAgents.map((agent) => [agent,
    agent === "jd-judge-b" ? { model: sol, thinking: base[agent].thinking } : base[agent]]));
  const profile = profiles["opus5.5revgpt6.1"];
  assert.deepEqual(Object.keys(profile).sort(), expectedAgents.slice().sort());
  assert.deepEqual(profile, expected);
  for (const agent of expectedAgents) assert.equal(profile[agent].thinking, base[agent].thinking, agent);
  assert.deepEqual(profile["jd-judge-a"], { model: opus, thinking: "high" });
  assert.deepEqual(profile["jd-judge-b"], { model: sol, thinking: "high" });
  assert.equal(profile["review-readability"].thinking, "medium");
  assert.ok(expectedAgents.filter((agent) => agent !== "jd-judge-b").every((agent) => profile[agent].model === opus));
  assert.equal(Object.hasOwn(manifest.oppositeProviderJudges.profilePairs, "opus5.5revgpt6.1"), false);
  assert.ok(!Object.values(manifest.oppositeProviderJudges.profilePairs).includes("opus5.5revgpt6.1"));
  assert.deepEqual(deriveCanonicalProfileForSelection("opus5.5revgpt6.1", profiles, manifest), expected);
  assert.deepEqual(deriveRuntimeModelProfilesForSelection("opus5.5revgpt6.1", profiles, manifest),
    Object.fromEntries(Object.entries(expected).map(([agent, value]) => [agent, { model: value.model, effort: value.thinking }])));
});

test("manifest validation rejects unsupported versions, missing groups, duplicate names, and reserved commands", () => {
  assert.throws(() => validateManifest(validManifestPatch({ schemaVersion: 1 })), /schemaVersion must be 2/);
  assert.throws(() => validateManifest(validManifestPatch({ managedAgentGroups: {} })), /managedAgentGroups.*expected keys.*missing: odd/);
  // A schema 1 group layout fails closed instead of reintroducing retired routes.
  assert.throws(() => validateManifest(validManifestPatch({
    managedAgentGroups: { sdd: ["sdd-init"], odd: expectedOddAgents },
  })), /managedAgentGroups.*extra: sdd/);
  assert.throws(() => validateManifest(validManifestPatch({
    managedAgentGroups: { odd: [...expectedOddAgents, "sdd-init"] },
  })), /retired agent 'sdd-init'/);
  assert.throws(() => validateManifest(validManifestPatch({
    managedAgentGroups: { odd: ["orchestrator", "orchestrator"] },
  })), /duplicate value 'orchestrator'/);
  assert.throws(() => validateManifest(validManifestPatch({
    profiles: [
      { name: "gpt-5.6-recommended", modelsFile: "models.gpt-5.6-recommended.json" },
      { name: "gpt-5.6-recommended", modelsFile: "models.gpt-5.6-recommended.json" },
    ],
  })), /duplicate value 'gpt-5.6-recommended'/);
  assert.throws(() => validateManifest(validManifestPatch({
    profiles: [{ name: "status", modelsFile: "models.status.json" }],
    defaultProfile: "status",
  })), /reserved for commands/);
  assert.throws(() => validateManifest(validManifestPatch({ defaultProfile: "missing" })), /not registered/);
  assert.throws(() => validateManifest(validManifestPatch({
    profiles: [{ name: "Unsafe_Name", modelsFile: "models.Unsafe_Name.json" }],
  })), /safe lowercase command name/);
});

test("edit is reserved even when an explicit manifest command list omits it", () => {
  assert.ok((RESERVED_COMMAND_NAMES as readonly string[]).includes("edit"));
  assert.throws(() => validateManifest(validManifestPatch({
    reservedCommandNames: ["status", "list", "preview", "doctor", "undo", "recover"],
    profiles: [{ name: "edit", modelsFile: "models.edit.json" }],
    defaultProfile: "edit",
    oppositeProviderJudges: { enabled: false, agents: [], profilePairs: {} },
  })), /profile name 'edit' is reserved for commands/);
  assert.ok(validateManifest(validManifestPatch({ reservedCommandNames: undefined })).reservedCommandNames.includes("edit"));
});

test("profile validation rejects malformed objects, coverage drift, invalid identifiers, and invalid effort values", () => {
  const manifest = validateManifest(validManifestPatch({}));
  assert.throws(() => validateNamedProfile([], manifest, "arrayProfile"), /must be a JSON object/);

  for (const agent of ["gentle-ai-verify", "orchestrator", "review-refuter", "review-validator"]) {
    const missing = validProfilePatch({});
    delete missing[agent];
    assert.throws(() => validateNamedProfile(missing, manifest, "missingProfile"), new RegExp(`missing: ${agent}`));
  }

  const extra = validProfilePatch({ "unknown-agent": { model: "provider/model", thinking: "medium" } });
  assert.throws(() => validateNamedProfile(extra, manifest, "extraProfile"), /extra: unknown-agent/);
  // Retired schema 1 routes are no longer managed, so packaged profiles cannot carry them.
  const retired = validProfilePatch({ "sdd-init": { model: "provider/model", thinking: "medium" } });
  assert.throws(() => validateNamedProfile(retired, manifest, "retiredProfile"), /extra: sdd-init/);

  assert.throws(() => validateNamedProfile(validProfilePatch({ "gentle-ai-explore": [] }), manifest, "badEntry"), /must be a JSON object/);
  assert.throws(() => validateNamedProfile(validProfilePatch({ "gentle-ai-explore": { model: "provider/model", thinking: "medium", extra: true } }), manifest, "badEntry"), /expected keys/);
  assert.throws(() => validateNamedProfile(validProfilePatch({ "gentle-ai-explore": { model: "provider-only", thinking: "medium" } }), manifest, "badModel"), /provider\/model identifier/);
  for (const thinking of ["", " ", "\t\n", " max", "max ", 0, false, null, [], {}]) {
    assert.throws(() => validateNamedProfile(validProfilePatch({
      "gentle-ai-explore": { model: "provider/model", thinking },
    }), manifest, "badEffort"), /thinking must be (?:a string|a non-empty, trimmed string)/);
  }
  assert.throws(() => validateNamedProfile(validProfilePatch({
    "gentle-ai-explore": { model: "provider/model" },
  }), manifest, "missingEffort"), /missing: thinking/);

  assert.throws(() => validateProfileSet({ "gpt-5.6-recommended": validProfilePatch({}) }, manifest), /missing: grok-recommended/);
  assert.throws(() => validateProfileSet({ "gpt-5.6-recommended": validProfilePatch({}), "grok-recommended": validProfilePatch({}), other: validProfilePatch({}) }, manifest), /extra: other/);
});

test("profile validation and derivation preserve arbitrary trimmed effort strings literally", () => {
  const manifest = validateManifest(validManifestPatch({}));
  for (const thinking of ["low", "medium", "high", "xhigh", "max", "extreme", "Provider.Custom-v2", "custom effort"]) {
    const input = validProfilePatch({ "gentle-ai-explore": { model: "provider/model", thinking } });
    const validated = validateNamedProfile(input, manifest);
    assert.deepEqual(validated["gentle-ai-explore"], input["gentle-ai-explore"]);
    assert.deepEqual(deriveCanonicalProfile(validated, manifest)["gentle-ai-explore"], input["gentle-ai-explore"]);
    assert.deepEqual(deriveRuntimeModelProfiles(validated, manifest)["gentle-ai-explore"], {
      model: "provider/model", effort: thinking,
    });
  }
});

test("opposite-provider judge derivation pairs representative named profiles by provider and cost lane", async () => {
  const manifest = await packagedManifest();
  const profiles = await packagedProfiles(manifest);
  const lowCostEffective = deriveCanonicalProfileForSelection("gpt-5.6-low-cost", profiles, manifest);
  const astraOnlyEffective = deriveCanonicalProfileForSelection("gpt-astra-only-powerful", profiles, manifest);
  const grokRuntime = deriveRuntimeModelProfilesForSelection("grok-recommended", profiles, manifest);
  const disabledManifest = validateManifest(validManifestPatch({
    oppositeProviderJudges: {
      enabled: false,
      agents: expectedJudgeAgents,
      profilePairs: { "gpt-5.6-recommended": "grok-recommended", "grok-recommended": "gpt-5.6-recommended" },
    },
  }));
  const disabledOpenaiProfile = Object.fromEntries(expectedAgents.map((agent) => [agent, { model: `openai/${agent}`, thinking: "medium" }]));
  const disabledGrokProfile = Object.fromEntries(expectedAgents.map((agent) => [agent, { model: `xai/${agent}`, thinking: "xhigh" }]));
  assert.throws(() => validateProfileSet({
    "gpt-5.6-recommended": Object.fromEntries(expectedNonJudgeAgents.map((agent) => [agent, { model: `openai/${agent}`, thinking: "medium" }])),
    "grok-recommended": Object.fromEntries(expectedNonJudgeAgents.map((agent) => [agent, { model: `xai/${agent}`, thinking: "xhigh" }])),
  }, disabledManifest), /missing: review-risk/);
  const disabledProfiles = validateProfileSet({
    "gpt-5.6-recommended": disabledOpenaiProfile,
    "grok-recommended": disabledGrokProfile,
  }, disabledManifest);
  const disabledOpenaiEffective = deriveCanonicalProfileForSelection("gpt-5.6-recommended", disabledProfiles, disabledManifest);
  const disabledOpenaiRuntime = deriveRuntimeModelProfilesForSelection("gpt-5.6-recommended", disabledProfiles, disabledManifest);

  assert.deepEqual(lowCostEffective["gentle-ai-explore"], profiles["gpt-5.6-low-cost"]["gentle-ai-explore"]);
  assert.deepEqual(lowCostEffective.orchestrator, profiles["gpt-5.6-low-cost"].orchestrator);
  for (const agent of expectedJudgeAgents) {
    assert.deepEqual(lowCostEffective[agent], profiles["grok-low-cost"][agent]);
    assert.deepEqual(astraOnlyEffective[agent], profiles["grok-powerful"][agent]);
    assert.deepEqual(disabledOpenaiEffective[agent], disabledProfiles["gpt-5.6-recommended"][agent]);
  }
  assert.deepEqual(astraOnlyEffective["review-risk"], profiles["grok-powerful"]["review-risk"]);
  assert.deepEqual(grokRuntime["gentle-ai-worker"], { model: profiles["grok-recommended"]["gentle-ai-worker"].model, effort: profiles["grok-recommended"]["gentle-ai-worker"].thinking });
  assert.deepEqual(grokRuntime["jd-judge-a"], { model: profiles["gpt-5.6-recommended"]["jd-judge-a"].model, effort: profiles["gpt-5.6-recommended"]["jd-judge-a"].thinking });
  assert.deepEqual(managedAgents(disabledManifest), expectedAgents);
  assert.deepEqual(disabledOpenaiEffective["review-risk"], { model: "openai/review-risk", thinking: "medium" });
  assert.deepEqual(disabledOpenaiRuntime["jd-judge-a"], { model: "openai/jd-judge-a", effort: "medium" });
  assert.deepEqual(deriveRuntimeConfigForSelection("gpt-5.6-recommended", profiles, manifest, {
    model_profiles: { unrelatedAgent: { model: "keep/runtime", effort: "low" } },
  }).model_profiles, {
    unrelatedAgent: { model: "keep/runtime", effort: "low" },
    ...deriveRuntimeModelProfilesForSelection("gpt-5.6-recommended", profiles, manifest),
  });
});

test("canonical and runtime derivation are pure and map thinking to effort", async () => {
  const manifest = await packagedManifest();
  const profiles = await packagedProfiles(manifest);
  const defaultProfile = profiles[manifest.defaultProfile];
  const canonical = deriveCanonicalProfile(defaultProfile, manifest);
  const runtimeProfiles = deriveRuntimeModelProfiles(defaultProfile, manifest);
  const runtimeConfig = deriveRuntimeConfig(defaultProfile, manifest, {
    preserved: true,
    model_profiles: {
      unrelatedAgent: { model: "keep/runtime", effort: "low" },
      "gentle-ai-verify": { model: "stale/research", effort: "low" },
    },
  });

  assert.notEqual(canonical, defaultProfile);
  assert.notEqual(canonical["gentle-ai-verify"], defaultProfile["gentle-ai-verify"]);
  assert.deepEqual(canonical, defaultProfile);
  assert.deepEqual(runtimeProfiles["gentle-ai-verify"], { model: defaultProfile["gentle-ai-verify"].model, effort: defaultProfile["gentle-ai-verify"].thinking });
  assert.deepEqual(runtimeConfig, {
    preserved: true,
    model_profiles: {
      unrelatedAgent: { model: "keep/runtime", effort: "low" },
      ...runtimeProfiles,
    },
  });

  const originalResearchThinking = defaultProfile["gentle-ai-verify"].thinking;
  canonical["gentle-ai-verify"].thinking = "low";
  assert.equal(defaultProfile["gentle-ai-verify"].thinking, originalResearchThinking);
});
