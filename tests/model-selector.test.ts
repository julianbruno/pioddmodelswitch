import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { selectModel } from "../extensions/model-profiles/model-selector.ts";

// Exercise the installed native component, not a select mock. Explicit overrides take precedence.
async function nativeModule(): Promise<string> {
  if (process.env.PI_TUI_MODULE) return process.env.PI_TUI_MODULE;
  const root = process.env.PI_MANAGED_INSTALL_ROOT || join(homedir(), ".pi/agent/install");
  let version: string;
  try {
    version = (await readFile(join(root, "current-version"), "utf8")).trim();
  } catch {
    throw new Error("Cannot resolve the active Pi release; set PI_TUI_MODULE to the native pi-tui entrypoint.");
  }
  if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error("Invalid Pi current-version; set PI_TUI_MODULE to the native pi-tui entrypoint.");
  }
  return pathToFileURL(join(root, "releases", version, "node_modules/@earendil-works/pi-tui/dist/index.js")).href;
}
const native = await import(await nativeModule());
const options = Array.from({ length: 80 }, (_, i) => `provider${i % 2}/model-${i} — Similar name`);
const theme = { fg: (_: string, text: string) => text };

for (const rows of [24, 5, 2, 1]) test(`native model viewport scrolls and confirms exact identity at height ${rows}`, async () => {
  let component: any;
  const terminal = { rows };
  let renders = 0;
  const ui = { custom: (factory: any) => new Promise(resolve => {
    component = factory({ terminal, requestRender: () => renders++ }, theme, {}, resolve);
  }) };
  const result = selectModel(ui as any, options, async () => native);
  await new Promise(resolve => setImmediate(resolve));
  function check(index: number) {
    const lines = component.render(100);
    assert.ok(lines.length <= terminal.rows);
    assert.ok(component.render(20).every((line: string) => native.visibleWidth(line) <= 20));
    assert.ok(lines.some((line: string) => line.startsWith("→ ") && line.includes(options[index])));
  }
  check(0);
  for (let i = 1; i < options.length; i++) { component.handleInput("\u001b[B"); check(i); }
  component.handleInput("\u001b[A"); check(78);
  component.handleMouse({ type: "wheel", wheelDelta: 1, x: 0, y: 0 }); check(79);
  component.handleMouse({ type: "wheel", wheelDelta: -1, x: 0, y: 0 }); check(78);
  terminal.rows = 3; check(78);
  component.handleInput("\r");
  assert.equal(await result, options[78]);
  assert.ok(renders >= 80);
});

test("native model picker cancels and unsupported custom falls back", async () => {
  let component: any;
  const result = selectModel({ custom: (factory: any) => new Promise(resolve => {
    component = factory({ terminal: { rows: 10 }, requestRender() {} }, theme, {}, resolve);
  }) } as any, options, async () => native);
  await new Promise(resolve => setImmediate(resolve));
  component.handleInput("\u001b");
  assert.equal(await result, undefined);
  let calls = 0;
  assert.equal(await selectModel({ select: async (title: string, choices: string[]) => {
    calls++; assert.equal(title, "Model"); assert.deepEqual(choices, options); return choices[79];
  } } as any, options), options[79]);
  assert.equal(calls, 1);
});
