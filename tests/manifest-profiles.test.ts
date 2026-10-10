import assert from "node:assert/strict";
import test from "node:test";

import { deriveRuntimeModelProfiles, validateManifest, validateNamedProfile } from "../extensions/model-profiles/core.ts";

const manifest = validateManifest({
  schemaVersion: 2,
  defaultProfile: "custom",
  managedAgentGroups: { odd: ["orchestrator"] },
  profiles: [{ name: "custom", modelsFile: "models.custom.json" }],
});

test("named profiles preserve Pi model IDs containing slash characters", () => {
  const input = { orchestrator: { model: "custom/vendor/family/model", thinking: "high" } };
  const result = validateNamedProfile(input, manifest, "custom");
  assert.deepEqual(result, input);
  assert.deepEqual(deriveRuntimeModelProfiles(result, manifest).orchestrator, {
    model: "custom/vendor/family/model", effort: "high",
  });
});

test("named profiles still reject missing provider/model and whitespace identities", () => {
  for (const model of ["", "provider", "/model", "provider/", " provider/model", "provider/model ", "pro vider/model", "provider/nested/ bad", "provider/model\n"]) {
    assert.throws(() => validateNamedProfile({ orchestrator: { model, thinking: "high" } }, manifest), /provider\/model/, JSON.stringify(model));
  }
});
