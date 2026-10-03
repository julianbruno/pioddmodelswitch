import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildModelCatalog, type ModelCatalog } from "../extensions/model-profiles/catalog.ts";

const require = createRequire(import.meta.url);

export function parseArguments(args: string[]): { sdk?: string; output: string } {
  const options: { sdk?: string; output: string } = { output: "config/model-catalog.json" };
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    const value = args[i + 1];
    if ((flag !== "--sdk" && flag !== "--output") || !value || value.startsWith("--") || seen.has(flag)) {
      throw new Error("Usage: export-model-catalog.ts [--sdk <package-directory-or-entry>] [--output <json-path>]");
    }
    seen.add(flag);
    if (flag === "--sdk") options.sdk = value;
    else options.output = value;
  }
  return options;
}

/** Prefer ordinary local Node resolution; global/custom installs opt in via --sdk. */
export function resolveSdk(explicitPath?: string): string {
  try {
    return require.resolve(explicitPath ? resolve(explicitPath) : "@earendil-works/pi-coding-agent");
  } catch {
    throw new Error("Cannot resolve Pi SDK. Install it locally or pass --sdk <package-directory-or-entry>.");
  }
}

type Sdk = {
  ModelRuntime?: { create(): Promise<{
    getAvailable(): Promise<readonly unknown[]>;
    getError?(): string | undefined;
  }> };
};

export async function collectCatalog(sdk: Sdk, generatedAt?: string): Promise<ModelCatalog> {
  if (typeof sdk.ModelRuntime?.create !== "function") throw new Error("Pi SDK must export ModelRuntime.create()");
  let available: readonly unknown[];
  try {
    const runtime = await sdk.ModelRuntime.create();
    if (typeof runtime.getAvailable !== "function") throw new Error("Unsupported API");
    available = await runtime.getAvailable();
    if (runtime.getError?.()) throw new Error("Invalid configuration");
  } catch {
    // SDK diagnostics may include private endpoint/configuration details.
    throw new Error("Pi model availability/configuration failed; diagnose it inside Pi. No catalog written.");
  }
  return buildModelCatalog(available, generatedAt);
}

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2));
  const sdkPath = resolveSdk(options.sdk);
  let sdk: Sdk;
  try {
    sdk = await import(pathToFileURL(sdkPath).href);
  } catch {
    throw new Error("Cannot load Pi SDK; check --sdk and the SDK's Node.js requirements.");
  }
  const catalog = await collectCatalog(sdk);
  const output = resolve(options.output);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(catalog, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  console.log(`Exported ${catalog.models.length} models to ${output}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Catalog export failed");
    process.exitCode = 1;
  });
}
