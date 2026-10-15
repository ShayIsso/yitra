import { describe, it, expect } from "vitest";
import { resolveCategorizationProvider, type AiCategorizationConfig } from "../config";
import { GEMINI_DEFAULT_MODEL } from "../gemini";
import { OLLAMA_DEFAULT_ENDPOINT, OLLAMA_DEFAULT_MODEL } from "../ollama";

const NOTHING_STORED = { storedProvider: null, hasStoredGeminiKey: false } as const;

function resolve(config: Partial<AiCategorizationConfig>) {
  return resolveCategorizationProvider({ hasGeminiKey: false, ...NOTHING_STORED, ...config });
}

describe("resolveCategorizationProvider", () => {
  it("resolves to off when nothing is set (fresh install makes zero external calls)", () => {
    expect(resolveCategorizationProvider({ hasGeminiKey: false, ...NOTHING_STORED })).toEqual({
      kind: "off",
      reason: "unset",
    });
  });

  it("resolves to off when explicitly disabled", () => {
    expect(resolve({ provider: "off", hasGeminiKey: true })).toEqual({
      kind: "off",
      reason: "explicit",
    });
  });

  it("resolves gemini to off when the key is missing", () => {
    expect(resolve({ provider: "gemini", hasGeminiKey: false })).toEqual({
      kind: "off",
      reason: "missing_gemini_key",
    });
  });

  it("resolves gemini to the fixed GO model when keyed", () => {
    expect(resolve({ provider: "gemini", hasGeminiKey: true })).toEqual({
      kind: "gemini",
      model: GEMINI_DEFAULT_MODEL,
      keySource: "environment",
    });
  });

  it("resolves ollama with sensible defaults when endpoint/model are unset", () => {
    expect(resolve({ provider: "ollama" })).toEqual({
      kind: "ollama",
      endpoint: OLLAMA_DEFAULT_ENDPOINT,
      model: OLLAMA_DEFAULT_MODEL,
    });
  });

  it("resolves ollama with a caller-supplied endpoint and model", () => {
    expect(
      resolve({
        provider: "ollama",
        ollamaEndpoint: "http://gpu:11434",
        ollamaModel: "gemma3:12b",
      }),
    ).toEqual({ kind: "ollama", endpoint: "http://gpu:11434", model: "gemma3:12b" });
  });

  it("falls back to defaults when ollama endpoint/model are blank", () => {
    expect(resolve({ provider: "ollama", ollamaEndpoint: "   ", ollamaModel: "   " })).toEqual({
      kind: "ollama",
      endpoint: OLLAMA_DEFAULT_ENDPOINT,
      model: OLLAMA_DEFAULT_MODEL,
    });
  });

  it("never selects ollama for a keyless gemini config (independent knobs)", () => {
    const resolution = resolve({ provider: "gemini", ollamaEndpoint: "http://gpu:11434" });
    expect(resolution.kind).toBe("off");
  });
});

describe("resolveCategorizationProvider precedence (environment wins, then stored, else off)", () => {
  describe("neither place configures a provider", () => {
    it("resolves to off", () => {
      expect(resolve({})).toEqual({ kind: "off", reason: "unset" });
    });

    it("resolves to off even when both keys are present, since a key alone selects nothing", () => {
      expect(resolve({ hasGeminiKey: true, hasStoredGeminiKey: true })).toEqual({
        kind: "off",
        reason: "unset",
      });
    });
  });

  describe("only the stored selection is set", () => {
    it("applies a stored gemini selection with its stored key", () => {
      expect(resolve({ storedProvider: "gemini", hasStoredGeminiKey: true })).toEqual({
        kind: "gemini",
        model: GEMINI_DEFAULT_MODEL,
        keySource: "stored",
      });
    });

    it("applies a stored ollama selection with the environment's endpoint and model", () => {
      expect(
        resolve({
          storedProvider: "ollama",
          ollamaEndpoint: "http://gpu:11434",
          ollamaModel: "gemma3:12b",
        }),
      ).toEqual({ kind: "ollama", endpoint: "http://gpu:11434", model: "gemma3:12b" });
    });

    it("applies a stored ollama selection with the defaults when the environment sets none", () => {
      expect(resolve({ storedProvider: "ollama" })).toEqual({
        kind: "ollama",
        endpoint: OLLAMA_DEFAULT_ENDPOINT,
        model: OLLAMA_DEFAULT_MODEL,
      });
    });

    it("applies a stored off selection as an explicit choice", () => {
      expect(resolve({ storedProvider: "off", hasStoredGeminiKey: true })).toEqual({
        kind: "off",
        reason: "explicit",
      });
    });
  });

  describe("only the environment selection is set", () => {
    it("applies the environment's gemini selection with the environment's key", () => {
      expect(resolve({ provider: "gemini", hasGeminiKey: true })).toEqual({
        kind: "gemini",
        model: GEMINI_DEFAULT_MODEL,
        keySource: "environment",
      });
    });

    it("applies the environment's ollama selection", () => {
      expect(resolve({ provider: "ollama" }).kind).toBe("ollama");
    });
  });

  describe("both places select a provider", () => {
    it("applies the environment's off over a stored gemini selection with a key", () => {
      expect(
        resolve({ provider: "off", storedProvider: "gemini", hasStoredGeminiKey: true }),
      ).toEqual({ kind: "off", reason: "explicit" });
    });

    it("applies the environment's ollama over a stored gemini selection", () => {
      expect(
        resolve({ provider: "ollama", storedProvider: "gemini", hasStoredGeminiKey: true }).kind,
      ).toBe("ollama");
    });

    it("applies the environment's gemini over a stored off selection", () => {
      expect(resolve({ provider: "gemini", hasGeminiKey: true, storedProvider: "off" })).toEqual({
        kind: "gemini",
        model: GEMINI_DEFAULT_MODEL,
        keySource: "environment",
      });
    });
  });

  describe("key presence", () => {
    it("resolves a stored gemini selection with no key anywhere to off", () => {
      expect(resolve({ storedProvider: "gemini" })).toEqual({
        kind: "off",
        reason: "missing_gemini_key",
      });
    });

    it("prefers the environment's key when both places hold one", () => {
      expect(
        resolve({ storedProvider: "gemini", hasGeminiKey: true, hasStoredGeminiKey: true }),
      ).toMatchObject({ kind: "gemini", keySource: "environment" });
    });

    it("uses the environment's key for a stored gemini selection that has none of its own", () => {
      expect(resolve({ storedProvider: "gemini", hasGeminiKey: true })).toMatchObject({
        kind: "gemini",
        keySource: "environment",
      });
    });

    it("never pairs the environment's gemini selection with a stored key", () => {
      expect(resolve({ provider: "gemini", hasStoredGeminiKey: true })).toEqual({
        kind: "off",
        reason: "missing_gemini_key",
      });
    });
  });
});
