import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { deriveRuntimeConfigForSelection, validateManifest, validateProfileSet } from "../extensions/model-profiles/core.ts";
import oddModelProfiles from "../extensions/odd-model-profiles.ts";

// Exact retired routes, not a prefix match: custom SDD-like routes remain user-owned.
const retired = ["sdd-init", "sdd-explore", "sdd-research", "sdd-proposal", "sdd-spec", "sdd-design", "sdd-tasks", "sdd-onboard", "sdd-archive", "sdd-apply", "sdd-verify", "sdd-status", "sdd-sync"];
const json = async (path: string) => JSON.parse(await readFile(path, "utf8"));

test("ODD-only registry excludes retired routes and preserves custom runtime settings", async () => {
  const input = await json("config/model-profiles.manifest.json");
  assert.deepEqual(Object.keys(input.managedAgentGroups), ["odd"]);
  const manifest = validateManifest(input);
  const inputs: Record<string, unknown> = {};
  for (const registration of manifest.profiles) {
    inputs[registration.name] = await json(`config/${registration.modelsFile}`);
    for (const agent of retired) assert.equal(Object.hasOwn(inputs[registration.name] as object, agent), false);
  }
  const profiles = validateProfileSet(inputs, manifest);
  const custom = { model: "custom/model", effort: "low" };
  const base = { setting: { enabled: true }, model_profiles: Object.fromEntries([...retired.map(agent => [agent, custom]), ["sdd-custom", custom], ["unrelated", custom]]) };
  const result = deriveRuntimeConfigForSelection(manifest.defaultProfile, profiles, manifest, base);
  const routes = result.model_profiles as Record<string, unknown>;
  for (const agent of retired) assert.equal(Object.hasOwn(routes, agent), false);
  assert.deepEqual(routes["sdd-custom"], custom);
  assert.deepEqual(routes.unrelated, custom);
  assert.deepEqual(result.setting, base.setting);
  for (const agent of retired) assert.ok(Object.hasOwn(base.model_profiles, agent), "input must not be mutated");
});

test("only the renamed command entrypoint and package are shipped", async () => {
  assert.equal((await json("package.json")).name, "jb-odd-models");
  const registered: string[] = [];
  oddModelProfiles({ registerCommand: (name: string) => registered.push(name) } as any, { piHome: "/nonexistent-pi-home" });
  assert.deepEqual(registered, ["jb-odd-models"]);
  await assert.rejects(readFile("extensions/sdd-model-profiles.ts", "utf8"), { code: "ENOENT" });
});
