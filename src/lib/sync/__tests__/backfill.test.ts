import { describe, it, expect, vi } from "vitest";
import { startCategorizationBackfill, type BackfillDeps } from "../backfill";
import { createSyncClaim, acquireAndRelease } from "../claim";
import { runAiSyncStep, type AiStepDeps, type AiStepEvent } from "../ai-step";
import { EMPTY_APP_SETTINGS } from "@/lib/app-settings";
import { createConfiguredProvider, isProviderConfigured } from "@/lib/ai-categorization";

const SUMMARY: AiStepEvent = { type: "ai_summary", applied: 4, queued: 2, skipped: 1 };

function aiDeps(): AiStepDeps {
  return {
    createProvider: vi.fn(async () => {
      throw new Error("the provider must be resolved only by the step under test");
    }),
    aiStore: {} as AiStepDeps["aiStore"],
    memoryStore: {} as AiStepDeps["memoryStore"],
    transferRouter: {} as AiStepDeps["transferRouter"],
  };
}

function stepYielding(...events: AiStepEvent[]) {
  return vi.fn<(deps: AiStepDeps) => AsyncGenerator<AiStepEvent>>(async function* () {
    for (const event of events) yield event;
  });
}

function deps(overrides: Partial<BackfillDeps> = {}): BackfillDeps {
  return {
    claim: createSyncClaim(),
    isProviderConfigured: async () => true,
    runAiStep: stepYielding(SUMMARY),
    ai: aiDeps(),
    ...overrides,
  };
}

/** Starts a backfill and, if it started, waits for its result. */
async function settle(backfillDeps: BackfillDeps) {
  const start = await startCategorizationBackfill(backfillDeps);
  return start.status === "started" ? start.result : start;
}

function offStore(stored: Partial<typeof EMPTY_APP_SETTINGS> = {}) {
  return {
    read: vi.fn(async () => ({ ...EMPTY_APP_SETTINGS, ...stored })),
    readCategorizationApiKey: vi.fn(async (): Promise<string | null> => null),
  };
}

describe("startCategorizationBackfill", () => {
  it("runs the sync's AI step with the deps it was given and reports that step's summary", async () => {
    const ai = aiDeps();
    const runAiStep = stepYielding(SUMMARY);

    const outcome = await settle(deps({ ai, runAiStep }));

    expect(runAiStep).toHaveBeenCalledTimes(1);
    expect(runAiStep).toHaveBeenCalledWith(ai);
    expect(outcome).toEqual({
      status: "completed",
      summary: { applied: 4, queued: 2, skipped: 1 },
    });
  });

  describe("with no provider configured", () => {
    it("refuses without taking the claim, resolving a provider, or starting the step", async () => {
      const claim = createSyncClaim();
      const acquire = vi.spyOn(claim, "acquire");
      const ai = aiDeps();
      const runAiStep = stepYielding(SUMMARY);

      const outcome = await settle(
        deps({ claim, ai, runAiStep, isProviderConfigured: async () => false }),
      );

      expect(outcome).toEqual({ status: "provider_off" });
      expect(acquire).not.toHaveBeenCalled();
      expect(ai.createProvider).not.toHaveBeenCalled();
      expect(runAiStep).not.toHaveBeenCalled();
    });

    it("never constructs an adapter or reads a key when composed with the real resolution", async () => {
      const store = offStore();
      const adapters = { gemini: vi.fn(), ollama: vi.fn() };
      const ai: AiStepDeps = {
        ...aiDeps(),
        createProvider: () => createConfiguredProvider({ env: {}, store, adapters }),
      };

      const outcome = await startCategorizationBackfill({
        claim: createSyncClaim(),
        isProviderConfigured: () => isProviderConfigured({ env: {}, store }),
        runAiStep: runAiSyncStep,
        ai,
      });

      expect(outcome).toEqual({ status: "provider_off" });
      expect(adapters.gemini).not.toHaveBeenCalled();
      expect(adapters.ollama).not.toHaveBeenCalled();
      expect(store.readCategorizationApiKey).not.toHaveBeenCalled();
    });
  });

  describe("when the provider stops resolving after the presence check", () => {
    function realResolution(store: ReturnType<typeof offStore>) {
      const adapters = { gemini: vi.fn(), ollama: vi.fn() };
      const ai: AiStepDeps = {
        ...aiDeps(),
        createProvider: () => createConfiguredProvider({ env: {}, store, adapters }),
      };
      return { adapters, ai };
    }

    it("ends incomplete with no adapter when the provider was switched off meanwhile", async () => {
      const store = offStore();
      const { adapters, ai } = realResolution(store);

      const outcome = await settle(deps({ ai, runAiStep: runAiSyncStep }));

      expect(outcome).toEqual({ status: "incomplete" });
      expect(adapters.gemini).not.toHaveBeenCalled();
      expect(adapters.ollama).not.toHaveBeenCalled();
    });

    it("ends incomplete with no adapter when the stored key cannot be decrypted", async () => {
      const store = offStore({ categorizationProvider: "gemini", hasCategorizationApiKey: true });
      store.readCategorizationApiKey.mockRejectedValue(new Error("synthetic auth-tag mismatch"));
      const { adapters, ai } = realResolution(store);

      const outcome = await settle(deps({ ai, runAiStep: runAiSyncStep }));

      expect(outcome).toEqual({ status: "incomplete" });
      expect(store.readCategorizationApiKey).toHaveBeenCalled();
      expect(adapters.gemini).not.toHaveBeenCalled();
      expect(adapters.ollama).not.toHaveBeenCalled();
    });
  });

  describe("sharing the sync's process claim", () => {
    it("answers started before the run ends, and releases the claim when the run ends unobserved", async () => {
      const claim = createSyncClaim();
      let finish!: () => void;
      const gate = new Promise<void>((resolve) => (finish = resolve));
      const runAiStep = vi.fn(async function* (): AsyncGenerator<AiStepEvent> {
        await gate;
        yield SUMMARY;
      });

      const start = await startCategorizationBackfill(deps({ claim, runAiStep }));

      expect(start.status).toBe("started");
      expect(claim.isHeld()).toBe(true);
      finish();
      await vi.waitFor(() => expect(claim.isHeld()).toBe(false));
    });

    it("refuses while a sync holds the claim, leaving that sync's claim untouched", async () => {
      const claim = createSyncClaim();
      claim.acquire();
      const runAiStep = stepYielding(SUMMARY);

      const outcome = await settle(deps({ claim, runAiStep }));

      expect(outcome).toEqual({ status: "sync_running" });
      expect(runAiStep).not.toHaveBeenCalled();
      expect(claim.isHeld()).toBe(true);
    });

    it("holds the claim for the whole run, so a sync started meanwhile is refused", async () => {
      const claim = createSyncClaim();
      let syncDuringRun: unknown = "not attempted";
      const runAiStep = vi.fn(async function* (): AsyncGenerator<AiStepEvent> {
        syncDuringRun = acquireAndRelease(claim, async function* () {});
        yield SUMMARY;
      });

      await settle(deps({ claim, runAiStep }));

      expect(syncDuringRun).toBeNull();
    });

    it("releases the claim once the run completes", async () => {
      const claim = createSyncClaim();

      await settle(deps({ claim }));

      expect(claim.isHeld()).toBe(false);
    });

    it("releases the claim even when the step throws", async () => {
      const claim = createSyncClaim();
      const runAiStep = vi.fn(async function* (): AsyncGenerator<AiStepEvent> {
        throw new Error("synthetic step failure");
      });

      const outcome = await settle(deps({ claim, runAiStep }));

      expect(outcome).toEqual({ status: "incomplete" });
      expect(claim.isHeld()).toBe(false);
    });

    it("refuses a second backfill started while the first is still running", async () => {
      const claim = createSyncClaim();
      let second: unknown;
      const runAiStep = vi.fn(async function* (): AsyncGenerator<AiStepEvent> {
        second = await settle(deps({ claim, runAiStep: stepYielding(SUMMARY) }));
        yield SUMMARY;
      });

      await settle(deps({ claim, runAiStep }));

      expect(second).toEqual({ status: "sync_running" });
    });
  });

  it("reports an incomplete run when the step ends without a summary", async () => {
    const outcome = await settle(deps({ runAiStep: stepYielding() }));

    expect(outcome).toEqual({ status: "incomplete" });
  });
});
