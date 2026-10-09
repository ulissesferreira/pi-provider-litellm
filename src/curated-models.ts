/**
 * Curated catalog for the Consensys LiteLLM proxy (fork-local adaptation).
 *
 * The proxy may expose many more routes than we use. Discovery still runs
 * against the proxy, but only these route IDs survive, renamed and ordered
 * as listed here. An empty list disables filtering.
 */
export const CURATED_MODELS: readonly { id: string; name: string }[] = [
  { id: "claude-opus-5-5", name: "Claude Opus 5.5" },
  { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5" },
  { id: "claude-haiku-5-5", name: "Claude Haiku 5.5" },
  { id: "gpt-6-astra", name: "GPT-6 Astra" },
  { id: "gpt-6.1-sol", name: "GPT-6.1 Sol" },
  { id: "gpt-6-luna", name: "GPT-6 Luna" },
  { id: "glm-5p3", name: "GLM 5.3" },
  { id: "glm-5p3-flash", name: "GLM 5.3 Flash" },
  { id: "deepseek-v4p1-flash", name: "DeepSeek V4.1 Flash" },
];

/** The only deployment this fork targets; the curated catalog applies exclusively to it. */
export const CURATED_PROXY_HOST = "litellm.consensys.info";

/** True when a (normalized) proxy root URL points at the curated Consensys deployment. */
export function isCuratedProxyUrl(baseUrl: string | undefined): boolean {
  if (!baseUrl) return false;
  try {
    return new URL(baseUrl).hostname === CURATED_PROXY_HOST;
  } catch {
    return false;
  }
}

/**
 * Filters discovery output down to `CURATED_MODELS`, applies the curated
 * display names, and restores the curated order. Models the proxy stopped
 * serving drop out; models added to the list appear after the next refresh.
 */
export function applyCuratedModels<T extends { id: string; name: string }>(models: readonly T[]): T[] {
  if (CURATED_MODELS.length === 0) return [...models];
  const order = new Map(CURATED_MODELS.map((entry, index) => [entry.id, index]));
  const names = new Map(CURATED_MODELS.map((entry) => [entry.id, entry.name]));
  return models
    .filter((model) => order.has(model.id))
    .map((model) => ({ ...model, name: names.get(model.id) ?? model.name }))
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}
