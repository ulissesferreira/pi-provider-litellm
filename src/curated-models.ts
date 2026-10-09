/**
 * Package-local deployment catalog, loaded from `catalog.json` at the package root.
 *
 * This is the fork's single point of configuration: which proxy it talks to, what the
 * provider is called, and which routes Pi may see. Nothing is read from outside the
 * package — no other tool's config, no environment beyond the upstream package's own.
 *
 * Semantics:
 * - `models` non-empty: discovery is narrowed to these route IDs, renamed and ordered
 *   as listed. Routes the proxy stopped serving drop out; new entries appear after
 *   the next refresh.
 * - `models` empty: no filtering; the package behaves like upstream.
 * - `catalog.json` missing or invalid: the fork falls back to upstream behavior
 *   (no filtering, upstream default base URL) with a one-line warning.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export type CatalogModel = { id: string; name: string };

export type Catalog = {
  displayName?: string;
  proxyBaseUrl?: string;
  models: CatalogModel[];
};

/** The package's own config file, resolved relative to this module. */
const CATALOG_URL = new URL("../catalog.json", import.meta.url);

export async function loadCatalog(catalogUrl: URL = CATALOG_URL): Promise<Catalog> {
  try {
    const raw = await readFile(fileURLToPath(catalogUrl), "utf8");
    const parsed = JSON.parse(raw) as Catalog;
    if (!isPlainObject(parsed) || !isModelList(parsed.models)) throw new Error("invalid shape");
    return {
      displayName: typeof parsed.displayName === "string" ? parsed.displayName : undefined,
      proxyBaseUrl: typeof parsed.proxyBaseUrl === "string" ? parsed.proxyBaseUrl : undefined,
      models: parsed.models,
    };
  } catch (error) {
    process.stderr.write(
      `LiteLLM: catalog.json is missing or invalid (${error instanceof Error ? error.message : String(error)}); ` +
        "behaving like upstream (unfiltered discovery).\n",
    );
    return { models: [] };
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isModelList(models: unknown): models is CatalogModel[] {
  return Array.isArray(models) && models.every((model) => isPlainObject(model) && typeof model.id === "string");
}

/** True when a (normalized) proxy root URL points at the catalog's proxy. */
export function isCuratedProxyUrl(catalog: Catalog, baseUrl: string | undefined): boolean {
  if (!catalog.proxyBaseUrl || !baseUrl) return false;
  try {
    return new URL(baseUrl).hostname === new URL(catalog.proxyBaseUrl).hostname;
  } catch {
    return false;
  }
}

/**
 * Filters discovery output down to the catalog's models, applies the curated
 * display names, and restores the curated order.
 */
export function applyCuratedModels<T extends { id: string; name: string }>(
  catalog: Catalog,
  models: readonly T[],
): T[] {
  if (catalog.models.length === 0) return [...models];
  const order = new Map(catalog.models.map((entry, index) => [entry.id, index]));
  const names = new Map(catalog.models.map((entry) => [entry.id, entry.name]));
  return models
    .filter((model) => order.has(model.id))
    .map((model) => ({ ...model, name: names.get(model.id) ?? model.name }))
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

/**
 * Same curation for models Pi has persisted from earlier sessions: routes rooted at the catalog's
 * proxy are narrowed to the catalog (dropping, renaming, ordering), so a stale store cannot
 * resurrect uncurated routes. Models from any other root pass through untouched.
 */
export function curateStoredModels<T extends { id: string; name: string; baseUrl: string }>(
  catalog: Catalog,
  models: readonly T[],
): T[] {
  if (catalog.models.length === 0) return [...models];
  const order = new Map(catalog.models.map((entry, index) => [entry.id, index]));
  const names = new Map(catalog.models.map((entry) => [entry.id, entry.name]));
  const others: T[] = [];
  const curated: T[] = [];
  for (const model of models) {
    if (isCuratedProxyUrl(catalog, model.baseUrl) && order.has(model.id)) {
      curated.push({ ...model, name: names.get(model.id) ?? model.name });
    } else if (!isCuratedProxyUrl(catalog, model.baseUrl)) {
      others.push(model);
    }
    // Catalog-proxy routes outside the catalog are dropped.
  }
  curated.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return [...others, ...curated];
}
