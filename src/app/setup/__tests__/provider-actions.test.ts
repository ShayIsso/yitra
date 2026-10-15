import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, requireSession: vi.fn() };
});

vi.mock("@/lib/ai-categorization", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai-categorization")>();
  return {
    ...actual,
    readProviderSettings: vi.fn(),
    saveProviderSelection: vi.fn(),
    clearStoredProviderKey: vi.fn(),
  };
});

import { requireSession } from "@/lib/auth";
import {
  clearStoredProviderKey,
  readProviderSettings,
  saveProviderSelection,
  type ProviderSettingsView,
} from "@/lib/ai-categorization";
import { CategorizationWriteError } from "@/lib/app-settings";
import {
  clearProviderKeyAction,
  getProviderSettingsAction,
  saveProviderSettingsAction,
} from "../provider-actions";

const PASTED_KEY = "fake-pasted-key-for-tests-only";

const VIEW: ProviderSettingsView = {
  environmentProvider: null,
  environmentHasKey: false,
  storedProvider: "gemini",
  hasStoredKey: true,
  effective: "gemini",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireSession).mockResolvedValue(undefined);
  vi.mocked(readProviderSettings).mockResolvedValue(VIEW);
});

describe("provider actions without a session", () => {
  const signInRedirect = new Error("NEXT_REDIRECT");

  beforeEach(() => {
    vi.mocked(requireSession).mockRejectedValue(signInRedirect);
  });

  it("read nothing", async () => {
    await expect(getProviderSettingsAction()).rejects.toBe(signInRedirect);
    expect(readProviderSettings).not.toHaveBeenCalled();
  });

  it("save nothing", async () => {
    await expect(
      saveProviderSettingsAction({ provider: "gemini", apiKey: PASTED_KEY }),
    ).rejects.toBe(signInRedirect);
    expect(saveProviderSelection).not.toHaveBeenCalled();
  });

  it("clear nothing", async () => {
    await expect(clearProviderKeyAction()).rejects.toBe(signInRedirect);
    expect(clearStoredProviderKey).not.toHaveBeenCalled();
  });
});

describe("saveProviderSettingsAction", () => {
  it("rejects an unknown provider without touching the module", async () => {
    const result = await saveProviderSettingsAction({ provider: "other" });
    expect(result.error).toBeTruthy();
    expect(saveProviderSelection).not.toHaveBeenCalled();
  });

  it("rejects non-object input without touching the module", async () => {
    const result = await saveProviderSettingsAction("gemini");
    expect(result.error).toBeTruthy();
    expect(saveProviderSelection).not.toHaveBeenCalled();
  });

  it("delegates a valid choice and answers with the fresh view", async () => {
    vi.mocked(saveProviderSelection).mockResolvedValue("saved");
    const result = await saveProviderSettingsAction({ provider: "gemini", apiKey: PASTED_KEY });

    expect(saveProviderSelection).toHaveBeenCalledWith({ provider: "gemini", apiKey: PASTED_KEY });
    expect(result).toEqual({ settings: VIEW });
  });

  it("never echoes the pasted key back", async () => {
    vi.mocked(saveProviderSelection).mockResolvedValue("saved");
    const result = await saveProviderSettingsAction({ provider: "gemini", apiKey: PASTED_KEY });
    expect(JSON.stringify(result)).not.toContain(PASTED_KEY);
  });

  it("asks for a key when the external provider has none anywhere", async () => {
    vi.mocked(saveProviderSelection).mockResolvedValue("key_required");
    const result = await saveProviderSettingsAction({ provider: "gemini" });
    expect(result.fieldErrors?.apiKey).toBeTruthy();
    expect(result.settings).toBeUndefined();
  });

  it("says the environment wins when it pins the provider", async () => {
    vi.mocked(saveProviderSelection).mockResolvedValue("environment_pinned");
    const result = await saveProviderSettingsAction({ provider: "ollama" });
    expect(result.error).toContain("AI_PROVIDER");
  });

  it("answers a failed write with a fixed message rather than the error", async () => {
    vi.mocked(saveProviderSelection).mockRejectedValue(new CategorizationWriteError());
    const result = await saveProviderSettingsAction({ provider: "gemini", apiKey: PASTED_KEY });
    expect(result.error).toBeTruthy();
    expect(JSON.stringify(result)).not.toContain(PASTED_KEY);
    expect(JSON.stringify(result)).not.toContain("CategorizationWriteError");
  });
});

describe("clearProviderKeyAction", () => {
  it("clears the stored key and answers with the fresh view", async () => {
    const result = await clearProviderKeyAction();
    expect(clearStoredProviderKey).toHaveBeenCalledOnce();
    expect(result).toEqual({ settings: VIEW });
  });
});
