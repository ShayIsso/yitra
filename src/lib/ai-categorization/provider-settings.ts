import { z } from "zod";
import { getEnv } from "@/lib/env";
import { drizzleAppSettingsStore, type AppSettingsStore } from "@/lib/app-settings";
import {
  categorizationConfigFrom,
  resolveCategorizationProvider,
  type AiProviderKind,
  type ProviderEnvironment,
  type StoredProviderSelection,
} from "./config";

/**
 * What the provider form may know (ADR-0014 §3). Both keys appear only as
 * presence flags — the form shows "a key is stored", never the key — and the
 * Ollama endpoint is left out, since this crosses to the browser and nothing
 * the environment holds needs to.
 */
export type ProviderSettingsView = {
  /** `AI_PROVIDER` when set; it wins over the stored choice, so the form says so. */
  readonly environmentProvider: AiProviderKind | null;
  readonly environmentHasKey: boolean;
  readonly storedProvider: AiProviderKind | null;
  readonly hasStoredKey: boolean;
  /** What the next categorization run will use. */
  readonly effective: AiProviderKind;
};

export function describeProviderSettings(
  env: ProviderEnvironment,
  stored: StoredProviderSelection,
): ProviderSettingsView {
  return {
    environmentProvider: env.AI_PROVIDER ?? null,
    environmentHasKey: Boolean(env.GEMINI_API_KEY),
    storedProvider: stored.categorizationProvider,
    hasStoredKey: stored.hasCategorizationApiKey,
    effective: resolveCategorizationProvider(categorizationConfigFrom(env, stored)).kind,
  };
}

const MAX_API_KEY_LENGTH = 512;
const PRINTABLE_ASCII = /^[\x21-\x7e]+$/;

/**
 * A pasted key is trimmed, and a blank one means "no new key". Messages never
 * interpolate the value: a rejected key is still a key.
 */
const pastedApiKey = z
  .string()
  .trim()
  .max(MAX_API_KEY_LENGTH, "המפתח ארוך מדי")
  .refine((key) => key === "" || PRINTABLE_ASCII.test(key), "המפתח מכיל תווים לא תקינים")
  .optional()
  .transform((key) => key || undefined);

export const providerSelectionSchema = z.discriminatedUnion(
  "provider",
  [
    z.object({ provider: z.literal("off") }),
    z.object({ provider: z.literal("ollama") }),
    z.object({ provider: z.literal("gemini"), apiKey: pastedApiKey }),
  ],
  { error: "בחירת ספק לא תקינה" },
);

export type ProviderSelectionInput = z.infer<typeof providerSelectionSchema>;

export type SaveProviderOutcome = "saved" | "environment_pinned" | "key_required";

type ProviderSettingsDeps = {
  readonly env: ProviderEnvironment;
  readonly store: Pick<AppSettingsStore, "read" | "setCategorization">;
};

const defaultDeps = (): ProviderSettingsDeps => ({ env: getEnv(), store: drizzleAppSettingsStore });

export async function readProviderSettings(
  deps: Pick<ProviderSettingsDeps, "env"> & {
    store: Pick<AppSettingsStore, "read">;
  } = defaultDeps(),
): Promise<ProviderSettingsView> {
  return describeProviderSettings(deps.env, await deps.store.read());
}

/**
 * Stores a provider choice. Choosing `off` or the local provider also clears
 * any stored external key, so no secret outlives the choice that needed it;
 * re-choosing the external provider without pasting a key keeps the stored one.
 *
 * Refused while `AI_PROVIDER` is set: the environment wins (ADR-0014 §3), so a
 * stored choice would not apply, and saving it would pretend otherwise.
 */
export async function saveProviderSelection(
  input: ProviderSelectionInput,
  deps: ProviderSettingsDeps = defaultDeps(),
): Promise<SaveProviderOutcome> {
  if (deps.env.AI_PROVIDER !== undefined) return "environment_pinned";

  if (input.provider !== "gemini") {
    await deps.store.setCategorization({ provider: input.provider, apiKey: null });
    return "saved";
  }

  if (input.apiKey !== undefined) {
    await deps.store.setCategorization({ provider: "gemini", apiKey: input.apiKey });
    return "saved";
  }

  const settings = await deps.store.read();
  if (!settings.hasCategorizationApiKey && !deps.env.GEMINI_API_KEY) return "key_required";

  await deps.store.setCategorization({ provider: "gemini" });
  return "saved";
}

/**
 * Forgets the stored key, and resets the stored selection to `off` rather than
 * leaving an external selection with no key. Allowed while the environment
 * pins the provider — removing a secret is never the wrong move — though the
 * pinned provider still applies.
 */
export async function clearStoredProviderKey(
  deps: Pick<ProviderSettingsDeps, "store"> = defaultDeps(),
): Promise<void> {
  await deps.store.setCategorization({ provider: "off", apiKey: null });
}
