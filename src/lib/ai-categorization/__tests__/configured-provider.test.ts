import { describe, it, expect, vi } from "vitest";
import { EMPTY_APP_SETTINGS, type AppSettings } from "@/lib/app-settings";
import { createConfiguredProvider, type ProviderSources } from "../config";
import type { CategorizationProvider } from "../provider";

const STORED_KEY = "fake-stored-key-for-tests-only";
const ENV_KEY = "fake-environment-key-for-tests-only";

function sources(
  env: ProviderSources["env"],
  stored: Partial<AppSettings> = {},
  storedKey: string | null = STORED_KEY,
) {
  const readCategorizationApiKey = vi.fn(async () => storedKey);
  const gemini = vi.fn(
    (config: { apiKey: string; model: string }): CategorizationProvider => ({
      modelId: `gemini:${config.model}`,
      generate: async () => "",
    }),
  );
  const ollama = vi.fn(
    (config: { endpoint: string; model: string }): CategorizationProvider => ({
      modelId: `ollama:${config.model}`,
      generate: async () => "",
    }),
  );
  const deps: ProviderSources = {
    env,
    store: {
      read: async () => ({ ...EMPTY_APP_SETTINGS, ...stored }),
      readCategorizationApiKey,
    },
    adapters: { gemini, ollama },
  };
  return { deps, readCategorizationApiKey, gemini, ollama };
}

describe("createConfiguredProvider", () => {
  it("builds nothing and reads no key when nothing is configured anywhere", async () => {
    const { deps, readCategorizationApiKey, gemini, ollama } = sources({});
    expect(await createConfiguredProvider(deps)).toBeNull();
    expect(readCategorizationApiKey).not.toHaveBeenCalled();
    expect(gemini).not.toHaveBeenCalled();
    expect(ollama).not.toHaveBeenCalled();
  });

  it("builds the gemini adapter with the decrypted stored key for a stored selection", async () => {
    const { deps, gemini } = sources(
      {},
      { categorizationProvider: "gemini", hasCategorizationApiKey: true },
    );
    expect(await createConfiguredProvider(deps)).not.toBeNull();
    expect(gemini).toHaveBeenCalledWith(expect.objectContaining({ apiKey: STORED_KEY }));
  });

  it("injects the environment's key without decrypting the stored one", async () => {
    const { deps, readCategorizationApiKey, gemini } = sources(
      { GEMINI_API_KEY: ENV_KEY },
      { categorizationProvider: "gemini", hasCategorizationApiKey: true },
    );
    await createConfiguredProvider(deps);
    expect(gemini).toHaveBeenCalledWith(expect.objectContaining({ apiKey: ENV_KEY }));
    expect(readCategorizationApiKey).not.toHaveBeenCalled();
  });

  it("builds the ollama adapter without reading any key for a stored local selection", async () => {
    const { deps, readCategorizationApiKey, ollama } = sources(
      {},
      { categorizationProvider: "ollama" },
    );
    expect(await createConfiguredProvider(deps)).not.toBeNull();
    expect(ollama).toHaveBeenCalledOnce();
    expect(readCategorizationApiKey).not.toHaveBeenCalled();
  });

  it("lets the environment's off override a stored gemini selection", async () => {
    const { deps, gemini, readCategorizationApiKey } = sources(
      { AI_PROVIDER: "off" },
      { categorizationProvider: "gemini", hasCategorizationApiKey: true },
    );
    expect(await createConfiguredProvider(deps)).toBeNull();
    expect(gemini).not.toHaveBeenCalled();
    expect(readCategorizationApiKey).not.toHaveBeenCalled();
  });

  it("never decrypts the stored key for a gemini selection pinned by the environment", async () => {
    const { deps, gemini, readCategorizationApiKey } = sources(
      { AI_PROVIDER: "gemini" },
      { categorizationProvider: "gemini", hasCategorizationApiKey: true },
    );
    expect(await createConfiguredProvider(deps)).toBeNull();
    expect(gemini).not.toHaveBeenCalled();
    expect(readCategorizationApiKey).not.toHaveBeenCalled();
  });

  it("builds nothing when the stored key disappears between the read and the decrypt", async () => {
    const { deps, gemini } = sources(
      {},
      { categorizationProvider: "gemini", hasCategorizationApiKey: true },
      null,
    );
    expect(await createConfiguredProvider(deps)).toBeNull();
    expect(gemini).not.toHaveBeenCalled();
  });

  it("reflects a selection changed between two runs without a restart", async () => {
    let stored: Partial<AppSettings> = { categorizationProvider: null };
    const { deps } = sources({});
    const live: ProviderSources = {
      ...deps,
      store: { ...deps.store, read: async () => ({ ...EMPTY_APP_SETTINGS, ...stored }) },
    };

    expect(await createConfiguredProvider(live)).toBeNull();
    stored = { categorizationProvider: "ollama" };
    expect(await createConfiguredProvider(live)).not.toBeNull();
  });
});
