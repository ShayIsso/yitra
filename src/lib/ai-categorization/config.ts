import { getEnv } from "@/lib/env";
import {
  drizzleAppSettingsStore,
  type AppSettings,
  type AppSettingsStore,
} from "@/lib/app-settings";
import type { CategorizationProvider } from "./provider";
import { createGeminiProvider, GEMINI_DEFAULT_MODEL, type GeminiModel } from "./gemini";
import { createOllamaProvider, OLLAMA_DEFAULT_ENDPOINT, OLLAMA_DEFAULT_MODEL } from "./ollama";

export type AiProviderKind = "gemini" | "ollama" | "off";

/**
 * The provider decision inputs: the environment's values and the app-settings
 * row's (ADR-0014 §3). Both keys arrive as presence *flags* rather than the
 * keys themselves — the secret never enters this pure resolution path or any
 * returned value, so a resolution result can be logged without leaking
 * (zero-leak policy).
 */
export interface AiCategorizationConfig {
  /** `AI_PROVIDER`. */
  readonly provider?: AiProviderKind;
  /** Whether `GEMINI_API_KEY` is set. */
  readonly hasGeminiKey: boolean;
  readonly ollamaEndpoint?: string;
  readonly ollamaModel?: string;
  readonly storedProvider: AiProviderKind | null;
  readonly hasStoredGeminiKey: boolean;
}

/** Which of the two places the Gemini key is read from; never the key itself. */
export type GeminiKeySource = "environment" | "stored";

export type ProviderResolution =
  | { readonly kind: "off"; readonly reason: "unset" | "explicit" | "missing_gemini_key" }
  | { readonly kind: "gemini"; readonly model: GeminiModel; readonly keySource: GeminiKeySource }
  | { readonly kind: "ollama"; readonly endpoint: string; readonly model: string };

/**
 * Pure resolution of "which provider, if any" for the pipeline (#148).
 *
 * Environment-wins (ADR-0014 §3): `AI_PROVIDER` when set, else the stored
 * selection; `GEMINI_API_KEY` when set, else the stored key. With nothing
 * configured in either place the result is `off`, so a fresh install makes
 * zero external calls; `gemini` selected without a key also resolves to `off`
 * (`missing_gemini_key`) rather than failing at call time.
 *
 * A provider pinned by `AI_PROVIDER` never takes the stored key: the in-app
 * form cannot manage anything while the environment pins the provider, so
 * nothing it stored may feed that configuration unseen. A stored selection
 * may take the environment's key, which the form does show.
 *
 * No I/O, no env access — the caller supplies the config, so this is fully
 * testable without touching `process.env` or the database.
 */
export function resolveCategorizationProvider(config: AiCategorizationConfig): ProviderResolution {
  const selected = config.provider ?? config.storedProvider ?? undefined;
  const provider = selected ?? "off";
  switch (provider) {
    case "off":
      return { kind: "off", reason: selected === undefined ? "unset" : "explicit" };
    case "gemini":
      if (config.hasGeminiKey) {
        return { kind: "gemini", model: GEMINI_DEFAULT_MODEL, keySource: "environment" };
      }
      return config.provider === undefined && config.hasStoredGeminiKey
        ? { kind: "gemini", model: GEMINI_DEFAULT_MODEL, keySource: "stored" }
        : { kind: "off", reason: "missing_gemini_key" };
    case "ollama":
      return {
        kind: "ollama",
        endpoint: config.ollamaEndpoint?.trim() || OLLAMA_DEFAULT_ENDPOINT,
        model: config.ollamaModel?.trim() || OLLAMA_DEFAULT_MODEL,
      };
  }
}

/** What provider resolution needs from the app-settings row: the selection, and the key only as a flag. */
export type StoredProviderSelection = Pick<
  AppSettings,
  "categorizationProvider" | "hasCategorizationApiKey"
>;

/** The environment variables provider resolution reads (`src/lib/env.ts`). */
export type ProviderEnvironment = {
  readonly AI_PROVIDER?: AiProviderKind;
  readonly GEMINI_API_KEY?: string;
  readonly OLLAMA_ENDPOINT?: string;
  readonly OLLAMA_MODEL?: string;
};

/** Reduces both configuration places to the resolver's input — keys become presence flags here. */
export function categorizationConfigFrom(
  env: ProviderEnvironment,
  stored: StoredProviderSelection,
): AiCategorizationConfig {
  return {
    provider: env.AI_PROVIDER,
    hasGeminiKey: Boolean(env.GEMINI_API_KEY),
    ollamaEndpoint: env.OLLAMA_ENDPOINT,
    ollamaModel: env.OLLAMA_MODEL,
    storedProvider: stored.categorizationProvider,
    hasStoredGeminiKey: stored.hasCategorizationApiKey,
  };
}

export type ProviderSources = {
  readonly env: ProviderEnvironment;
  readonly store: Pick<AppSettingsStore, "read" | "readCategorizationApiKey">;
  readonly adapters?: {
    readonly gemini: (config: { apiKey: string; model: GeminiModel }) => CategorizationProvider;
    readonly ollama: (config: { endpoint: string; model: string }) => CategorizationProvider;
  };
};

const ADAPTERS: NonNullable<ProviderSources["adapters"]> = {
  gemini: createGeminiProvider,
  ollama: createOllamaProvider,
};

/**
 * Constructs the configured provider instance, or `null` when AI categorization
 * is off. Called once per run, reading the stored selection at that moment, so
 * a change made in the app applies to the next run without a restart.
 *
 * Thin glue over the pure resolver: only key-presence flags enter resolution,
 * and the key the resolution names — the environment's, or the stored one,
 * decrypted only then — is injected straight into the adapter and never
 * returned or logged.
 */
export async function createConfiguredProvider(
  sources: ProviderSources = { env: getEnv(), store: drizzleAppSettingsStore },
): Promise<CategorizationProvider | null> {
  const { env, store, adapters = ADAPTERS } = sources;
  const resolution = resolveCategorizationProvider(
    categorizationConfigFrom(env, await store.read()),
  );

  switch (resolution.kind) {
    case "off":
      return null;
    case "gemini": {
      const apiKey =
        resolution.keySource === "environment"
          ? env.GEMINI_API_KEY
          : await store.readCategorizationApiKey();
      return apiKey ? adapters.gemini({ apiKey, model: resolution.model }) : null;
    }
    case "ollama":
      return adapters.ollama({ endpoint: resolution.endpoint, model: resolution.model });
  }
}
