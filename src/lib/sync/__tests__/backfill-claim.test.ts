import { describe, it, expect, vi, afterEach } from "vitest";
import type { AiStepEvent } from "../ai-step";

vi.mock("@/lib/credentials", () => ({
  listCredentials: vi.fn(async () => []),
  getDecryptedCredentials: vi.fn(),
}));
vi.mock("@/lib/scraper", () => ({ getSyncStartDate: vi.fn(), syncBank: vi.fn() }));
vi.mock("@/lib/sync/runs", () => ({
  startSyncRun: vi.fn(),
  completeSyncRun: vi.fn(),
  failSyncRun: vi.fn(),
  syncRunStatusForEvent: vi.fn(),
  drizzleSyncRunStore: {},
}));
vi.mock("@/lib/sync/post-import", () => ({ runPostImportPipeline: async function* () {} }));
vi.mock("@/lib/sync/ai-step", () => ({ runAiSyncStep: vi.fn() }));
vi.mock("@/lib/transactions", () => ({ importScrapedAccounts: vi.fn() }));
vi.mock("@/lib/reconciliation", () => ({
  drizzleReconciliationStore: {},
  drizzleSuspectedTransferRouter: {},
}));
vi.mock("@/lib/recurring-detection", () => ({ runDetection: vi.fn(), drizzleRecurringStore: {} }));
vi.mock("@/lib/ai-categorization", () => ({
  createAiCategorizationStore: vi.fn(),
  createConfiguredProvider: vi.fn(),
  isProviderConfigured: vi.fn(async () => true),
  DEFAULT_PACING: {},
}));
vi.mock("@/lib/merchant-memory", () => ({ createMerchantMemoryStore: vi.fn() }));
vi.mock("@/db/schema", () => ({ bankAccounts: { credentialId: "credential_id" } }));
vi.mock("@/db", () => ({
  db: { query: { bankAccounts: { findFirst: vi.fn(async () => undefined) } } },
}));

import { runAiSyncStep } from "@/lib/sync/ai-step";
import { backfillCategorization, syncAllBanksClaimed } from "@/lib/sync";

const releases: Array<() => void> = [];

afterEach(() => {
  for (const release of releases.splice(0)) release();
});

describe("backfillCategorization and syncAllBanksClaimed share one claim", () => {
  it("refuses a backfill while a sync holds the claim", async () => {
    const sync = syncAllBanksClaimed();
    expect(sync).not.toBeNull();
    releases.push(sync!.release);

    const start = await backfillCategorization();

    expect(start).toEqual({ status: "sync_running" });
    expect(runAiSyncStep).not.toHaveBeenCalled();
  });

  it("refuses a sync while a backfill runs, and frees the claim when it ends", async () => {
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => (finish = resolve));
    vi.mocked(runAiSyncStep).mockImplementation(async function* (): AsyncGenerator<AiStepEvent> {
      await gate;
      yield { type: "ai_summary", applied: 1, queued: 0, skipped: 0 };
    });

    const start = await backfillCategorization();
    expect(start.status).toBe("started");
    expect(syncAllBanksClaimed()).toBeNull();

    finish();
    if (start.status === "started") await start.result;
    const sync = syncAllBanksClaimed();
    expect(sync).not.toBeNull();
    releases.push(sync!.release);
  });
});
