import { describe, it, expect, vi } from "vitest";
import {
  EMPTY_APP_SETTINGS,
  type AppSettings,
  type CategorizationSelection,
} from "@/lib/app-settings";
import {
  clearStoredProviderKey,
  describeProviderSettings,
  providerSelectionSchema,
  saveProviderSelection,
  type ProviderEnvironment,
} from "..";

const PASTED_KEY = "fake-pasted-key-for-tests-only";

function fakeStore(stored: Partial<AppSettings> = {}) {
  const writes: CategorizationSelection[] = [];
  const store = {
    read: async () => ({ ...EMPTY_APP_SETTINGS, ...stored }),
    readCategorizationApiKey: vi.fn(async () => null),
    setCategorization: async (selection: CategorizationSelection) => {
      writes.push(selection);
    },
  };
  return { store, writes };
}

function save(input: unknown, env: ProviderEnvironment = {}, stored: Partial<AppSettings> = {}) {
  const { store, writes } = fakeStore(stored);
  const parsed = providerSelectionSchema.parse(input);
  return saveProviderSelection(parsed, { env, store }).then((outcome) => ({
    outcome,
    writes,
    store,
  }));
}

describe("describeProviderSettings", () => {
  it("describes a fresh install as off with nothing pinned or stored", () => {
    expect(describeProviderSettings({}, EMPTY_APP_SETTINGS)).toEqual({
      environmentProvider: null,
      environmentHasKey: false,
      storedProvider: null,
      hasStoredKey: false,
      effective: "off",
    });
  });

  it("reports the environment's provider as pinning the effective one over the stored choice", () => {
    const view = describeProviderSettings(
      { AI_PROVIDER: "off" },
      { ...EMPTY_APP_SETTINGS, categorizationProvider: "ollama" },
    );
    expect(view).toMatchObject({
      environmentProvider: "off",
      storedProvider: "ollama",
      effective: "off",
    });
  });

  it("reports a stored gemini selection with no key anywhere as effectively off", () => {
    const view = describeProviderSettings(
      {},
      { ...EMPTY_APP_SETTINGS, categorizationProvider: "gemini" },
    );
    expect(view).toMatchObject({ storedProvider: "gemini", hasStoredKey: false, effective: "off" });
  });

  it("carries only presence flags, never a key", () => {
    const view = describeProviderSettings(
      { GEMINI_API_KEY: PASTED_KEY },
      { ...EMPTY_APP_SETTINGS, categorizationProvider: "gemini", hasCategorizationApiKey: true },
    );
    expect(view).toMatchObject({
      environmentHasKey: true,
      hasStoredKey: true,
      effective: "gemini",
    });
    expect(JSON.stringify(view)).not.toContain(PASTED_KEY);
  });
});

describe("providerSelectionSchema", () => {
  it("accepts each of the three choices", () => {
    for (const provider of ["off", "ollama", "gemini"]) {
      expect(providerSelectionSchema.safeParse({ provider }).success).toBe(true);
    }
  });

  it("rejects an unknown provider", () => {
    expect(providerSelectionSchema.safeParse({ provider: "other" }).success).toBe(false);
  });

  it("trims a pasted key and reads a blank one as no new key", () => {
    expect(
      providerSelectionSchema.parse({ provider: "gemini", apiKey: `  ${PASTED_KEY}\n` }),
    ).toEqual({ provider: "gemini", apiKey: PASTED_KEY });
    expect(providerSelectionSchema.parse({ provider: "gemini", apiKey: "   " })).toEqual({
      provider: "gemini",
    });
  });

  it("rejects a key with characters no API key contains, without echoing it", () => {
    const result = providerSelectionSchema.safeParse({ provider: "gemini", apiKey: "מפתח שגוי" });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues.map((i) => i.message))).not.toContain("מפתח שגוי");
  });

  it("drops a key sent with a provider that takes none", () => {
    expect(providerSelectionSchema.parse({ provider: "ollama", apiKey: PASTED_KEY })).toEqual({
      provider: "ollama",
    });
  });
});

describe("saveProviderSelection", () => {
  it("stores off and clears any stored key", async () => {
    const { outcome, writes } = await save(
      { provider: "off" },
      {},
      { hasCategorizationApiKey: true },
    );
    expect(outcome).toBe("saved");
    expect(writes).toEqual([{ provider: "off", apiKey: null }]);
  });

  it("stores the local provider without a key, clearing any stored one", async () => {
    const { outcome, writes } = await save({ provider: "ollama" });
    expect(outcome).toBe("saved");
    expect(writes).toEqual([{ provider: "ollama", apiKey: null }]);
  });

  it("stores the external provider with a pasted key", async () => {
    const { outcome, writes } = await save({ provider: "gemini", apiKey: PASTED_KEY });
    expect(outcome).toBe("saved");
    expect(writes).toEqual([{ provider: "gemini", apiKey: PASTED_KEY }]);
  });

  it("keeps the stored key when the external provider is re-saved without a new one", async () => {
    const { outcome, writes, store } = await save(
      { provider: "gemini" },
      {},
      { categorizationProvider: "gemini", hasCategorizationApiKey: true },
    );
    expect(outcome).toBe("saved");
    expect(writes).toEqual([{ provider: "gemini" }]);
    expect(store.readCategorizationApiKey).not.toHaveBeenCalled();
  });

  it("accepts the external provider without a key when the environment supplies one", async () => {
    const { outcome, writes } = await save({ provider: "gemini" }, { GEMINI_API_KEY: PASTED_KEY });
    expect(outcome).toBe("saved");
    expect(writes).toEqual([{ provider: "gemini" }]);
  });

  it("refuses the external provider with no key anywhere, writing nothing", async () => {
    const { outcome, writes } = await save({ provider: "gemini" });
    expect(outcome).toBe("key_required");
    expect(writes).toEqual([]);
  });

  it("refuses any choice while the environment pins the provider, writing nothing", async () => {
    const { outcome, writes } = await save(
      { provider: "gemini", apiKey: PASTED_KEY },
      {
        AI_PROVIDER: "off",
      },
    );
    expect(outcome).toBe("environment_pinned");
    expect(writes).toEqual([]);
  });
});

describe("clearStoredProviderKey", () => {
  it("removes the stored key and turns categorization off", async () => {
    const { store, writes } = fakeStore({
      categorizationProvider: "gemini",
      hasCategorizationApiKey: true,
    });
    await clearStoredProviderKey({ store });
    expect(writes).toEqual([{ provider: "off", apiKey: null }]);
  });
});
