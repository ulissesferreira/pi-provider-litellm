import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyCuratedModels,
  type Catalog,
  curateStoredModels,
  isCuratedProxyUrl,
  loadCatalog,
} from "../src/curated-models.js";

const consensysRoot = "https://litellm.consensys.info";

const catalog: Catalog = {
  displayName: "Consensys LiteLLM",
  proxyBaseUrl: consensysRoot,
  models: [
    { id: "glm-5p3-flash", name: "GLM 5.3 Flash" },
    { id: "claude-opus-5-5", name: "Claude Opus 5.5" },
  ],
};

describe("catalog.json", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("ships a valid catalog with a proxy root and at least one model", async () => {
    const shipped = await loadCatalog();
    expect(shipped.proxyBaseUrl).toMatch(/^https:\/\//);
    expect(shipped.displayName).toBe("Consensys LiteLLM");
    expect(shipped.models.length).toBeGreaterThan(0);
    for (const model of shipped.models) {
      expect(model.id).not.toHaveLength(0);
      expect(model.name).not.toHaveLength(0);
    }
  });

  it("warns and behaves like upstream when the catalog file is missing", async () => {
    const write = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    await expect(loadCatalog(new URL("file:///nonexistent/catalog.json"))).resolves.toEqual({ models: [] });
    expect(write).toHaveBeenCalledWith(expect.stringContaining("catalog.json is missing or invalid"));
  });

  it("filters discovery output to the catalog, renamed and ordered", () => {
    const models = [
      { id: "claude-opus-5-5", name: "claude-opus-5-5" },
      { id: "grok-4", name: "Grok 4" },
      { id: "glm-5p3-flash", name: "glm-5p3-flash" },
    ] as { id: string; name: string }[];
    expect(applyCuratedModels(catalog, models)).toEqual([
      { id: "glm-5p3-flash", name: "GLM 5.3 Flash" },
      { id: "claude-opus-5-5", name: "Claude Opus 5.5" },
    ]);
  });

  it("does no filtering when the catalog lists no models", () => {
    const empty: Catalog = { models: [] };
    const models = [{ id: "anything", name: "Anything" }];
    expect(applyCuratedModels(empty, models)).toEqual(models);
    expect(curateStoredModels(empty, [])).toEqual([]);
  });

  it("matches the catalog proxy by hostname only", () => {
    expect(isCuratedProxyUrl(catalog, "https://litellm.consensys.info")).toBe(true);
    expect(isCuratedProxyUrl(catalog, "https://litellm.consensys.info/v1")).toBe(true);
    expect(isCuratedProxyUrl(catalog, "https://proxy.example.com")).toBe(false);
    expect(isCuratedProxyUrl(catalog, undefined)).toBe(false);
    expect(isCuratedProxyUrl({ models: [] }, "https://litellm.consensys.info")).toBe(false);
  });

  it("curates stored models rooted at the catalog proxy and passes others through untouched", () => {
    type Stored = { id: string; name: string; baseUrl: string };
    const stored: Stored[] = [
      { id: "grok-4", name: "Grok 4", baseUrl: `${consensysRoot}/v1` }, // dropped: uncurated at the proxy
      { id: "claude-opus-5-5", name: "claude-opus-5-5", baseUrl: `${consensysRoot}/v1` }, // renamed
      { id: "stored-model", name: "Stored", baseUrl: "https://proxy.example.com/v1" }, // untouched
    ];
    expect(curateStoredModels(catalog, stored)).toEqual([
      { id: "stored-model", name: "Stored", baseUrl: "https://proxy.example.com/v1" },
      { id: "claude-opus-5-5", name: "Claude Opus 5.5", baseUrl: `${consensysRoot}/v1` },
    ]);
  });
});
