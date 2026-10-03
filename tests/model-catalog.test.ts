import assert from "node:assert/strict";
import test from "node:test";
import { buildModelCatalog, validateModelCatalog } from "../extensions/model-profiles/catalog.ts";
import { collectCatalog, parseArguments, resolveSdk } from "../scripts/export-model-catalog.ts";

const date = "2026-01-01T00:00:00.000Z";
const model = (provider = "example", id = "demo/model") => ({
  provider, id, name: "Fictional model", reasoning: true,
  contextWindow: 32000, maxTokens: 4000, input: ["text", "image"],
  apiKey: "DO-NOT-EXPORT", headers: { Authorization: "DO-NOT-EXPORT" },
  baseUrl: "https://private.example", cost: { input: 123 },
});

test("exports allowlisted metadata with stable identity and deterministic ordering", () => {
  const catalog = buildModelCatalog([model("z"), model("a", "b"), model("a", "a")], date);
  assert.deepEqual(catalog.models.map((m) => m.model), ["a/a", "a/b", "z/demo/model"]);
  assert.deepEqual(catalog, buildModelCatalog([model("a", "a"), model("z"), model("a", "b")], date));
  assert.equal(catalog.schemaVersion, 1);
  assert.equal(catalog.source, "pi-model-runtime");
  assert.equal(catalog.generatedAt, date);
  assert.deepEqual(catalog.models[0].input, ["text", "image"]);
  assert.doesNotMatch(JSON.stringify(catalog), /DO-NOT-EXPORT|apiKey|headers|baseUrl|cost/);
  assert.deepEqual(validateModelCatalog(JSON.parse(JSON.stringify(catalog))), catalog);
});

test("rejects empty, duplicate, malformed and ambiguous model identities", () => {
  assert.throws(() => buildModelCatalog([], date), /empty/i);
  assert.throws(() => buildModelCatalog([model(), model()], date), /duplicate/i);
  for (const bad of [{ provider: "a/b" }, { id: " spaced " }, { reasoning: "yes" }, { contextWindow: 0 }, { input: ["audio"] }]) {
    assert.throws(() => buildModelCatalog([{ ...model(), ...bad }], date));
  }
});

test("validator rejects unknown fields, bad envelope, mismatched identity and noncanonical ordering", () => {
  const good = buildModelCatalog([model("a"), model("z")], date);
  for (const bad of [null, { ...good, schemaVersion: 2 }, { ...good, generatedAt: "yesterday" },
    { ...good, apiKey: "secret" }, { ...good, models: [] },
    { ...good, models: [...good.models].reverse() },
    { ...good, models: [{ ...good.models[0], model: "wrong/id" }] },
    { ...good, models: [{ ...good.models[0], headers: {} }] }]) {
    assert.throws(() => validateModelCatalog(bad));
  }
});

test("export collection uses asynchronous credential availability, not the whole registry", async () => {
  let created = false;
  const catalog = await collectCatalog({ ModelRuntime: { create: async () => {
    created = true;
    return { getAvailable: async () => [model()], getError: () => undefined };
  } } }, date);
  assert.equal(created, true);
  assert.equal(catalog.models.length, 1);
  await assert.rejects(() => collectCatalog({}), /ModelRuntime/);
  await assert.rejects(() => collectCatalog({ ModelRuntime: { create: async () => ({ getAvailable: async () => [] }) } }), /empty/i);
  await assert.rejects(() => collectCatalog({ ModelRuntime: { create: async () => ({ getAvailable: async () => [model()], getError: () => "private details" }) } }), /configuration/i);
});

test("CLI supports explicit SDK and output paths and rejects incomplete or unknown flags", () => {
  assert.deepEqual(parseArguments([]), { output: "config/model-catalog.json" });
  assert.deepEqual(parseArguments(["--sdk", "/sdk", "--output", "/out/catalog.json"]), { sdk: "/sdk", output: "/out/catalog.json" });
  for (const args of [["--sdk"], ["--unknown"], ["--output", "--sdk"], ["--sdk", "x", "--sdk", "y"]]) {
    assert.throws(() => parseArguments(args));
  }
  assert.throws(() => resolveSdk("/nonexistent-fictional-pi-sdk"), /SDK.*--sdk/);
});
