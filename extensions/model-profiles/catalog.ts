export type CatalogModel = {
  provider: string;
  id: string;
  model: string;
  name: string;
  reasoning: boolean;
  contextWindow: number;
  maxTokens: number;
  input: Array<"text" | "image">;
};

export type ModelCatalog = {
  schemaVersion: 1;
  source: "pi-model-runtime";
  generatedAt: string;
  models: CatalogModel[];
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected catalog object");
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: string[]): void {
  if (Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) {
    throw new Error("Invalid catalog fields");
  }
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
}

function compare(a: CatalogModel, b: CatalogModel): number {
  // Code-unit ordering is independent of the machine's locale.
  return a.model < b.model ? -1 : a.model > b.model ? 1 : 0;
}

/** Validate persisted data strictly; never silently accept credentials or extra fields. */
export function validateModelCatalog(value: unknown): ModelCatalog {
  const catalog = record(value);
  exactKeys(catalog, ["schemaVersion", "source", "generatedAt", "models"]);
  if (catalog.schemaVersion !== 1 || catalog.source !== "pi-model-runtime" ||
      typeof catalog.generatedAt !== "string" || !Number.isFinite(Date.parse(catalog.generatedAt)) ||
      new Date(catalog.generatedAt).toISOString() !== catalog.generatedAt) {
    throw new Error("Invalid catalog metadata");
  }
  if (!Array.isArray(catalog.models) || catalog.models.length === 0) throw new Error("Model catalog is empty");
  let previous: CatalogModel | undefined;
  for (const item of catalog.models) {
    const m = record(item);
    exactKeys(m, ["provider", "id", "model", "name", "reasoning", "contextWindow", "maxTokens", "input"]);
    if (!text(m.provider) || m.provider.includes("/") || !text(m.id) || !text(m.name) ||
        m.model !== `${m.provider}/${m.id}` || typeof m.reasoning !== "boolean" ||
        !Number.isSafeInteger(m.contextWindow) || (m.contextWindow as number) <= 0 ||
        !Number.isSafeInteger(m.maxTokens) || (m.maxTokens as number) <= 0 ||
        !Array.isArray(m.input) || m.input.length === 0 ||
        m.input.some((input) => input !== "text" && input !== "image") || new Set(m.input).size !== m.input.length) {
      throw new Error("Invalid catalog model metadata");
    }
    const current = m as CatalogModel;
    if (previous && compare(previous, current) >= 0) throw new Error("Duplicate or unsorted catalog model identity");
    previous = current;
  }
  return catalog as ModelCatalog;
}

/** Project SDK models through an explicit allowlist; do not serialize SDK objects. */
export function buildModelCatalog(models: readonly unknown[], generatedAt = new Date().toISOString()): ModelCatalog {
  const entries = models.map((value) => {
    const m = record(value);
    return {
      provider: m.provider, id: m.id, model: `${m.provider}/${m.id}`, name: m.name,
      reasoning: m.reasoning, contextWindow: m.contextWindow, maxTokens: m.maxTokens,
      input: Array.isArray(m.input) ? [...m.input] : m.input,
    } as CatalogModel;
  }).sort(compare);
  return validateModelCatalog({ schemaVersion: 1, source: "pi-model-runtime", generatedAt, models: entries });
}
