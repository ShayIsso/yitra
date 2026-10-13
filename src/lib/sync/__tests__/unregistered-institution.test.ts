import { describe, it, expect, vi, beforeEach } from "vitest";
import { isBankType } from "@/lib/bank-registry";

// The institution column is plain text (ADR-0013 §4), so a stored credential
// can name an institution later removed from the registry. These tests pin
// what a sync does with such a row: report it and carry on to the next one.

const RETIRED_ID = "retired-institution";
const RETIRED_CRED = "11111111-1111-4111-8111-111111111111";
const LIVE_CRED = "22222222-2222-4222-8222-222222222222";

vi.mock("@/lib/credentials", () => ({
  listCredentials: vi.fn(),
  getDecryptedCredentials: vi.fn(),
}));

vi.mock("@/lib/scraper", () => ({
  getSyncStartDate: vi.fn(() => new Date(0)),
  syncBank: vi.fn(),
}));

vi.mock("@/lib/sync/runs", () => ({
  startSyncRun: vi.fn(async () => "run-id"),
  completeSyncRun: vi.fn(async () => undefined),
  failSyncRun: vi.fn(async () => undefined),
  syncRunStatusForEvent: vi.fn(() => null),
  drizzleSyncRunStore: {},
}));

vi.mock("@/lib/sync/post-import", () => ({
  runPostImportPipeline: async function* () {},
}));

vi.mock("@/lib/sync/ai-step", () => ({ runAiSyncStep: vi.fn() }));
vi.mock("@/lib/transactions", () => ({ importScrapedAccounts: vi.fn() }));
vi.mock("@/lib/reconciliation", () => ({
  drizzleReconciliationStore: {},
  drizzleSuspectedTransferRouter: {},
}));
vi.mock("@/lib/recurring-detection", () => ({
  runDetection: vi.fn(),
  drizzleRecurringStore: {},
}));
vi.mock("@/lib/ai-categorization", () => ({
  createAiCategorizationStore: vi.fn(),
  createConfiguredProvider: vi.fn(),
  DEFAULT_PACING: {},
}));
vi.mock("@/lib/merchant-memory", () => ({ createMerchantMemoryStore: vi.fn() }));
vi.mock("@/db/schema", () => ({ bankAccounts: { credentialId: "credential_id" } }));
vi.mock("@/db", () => ({
  db: { query: { bankAccounts: { findFirst: vi.fn(async () => undefined) } } },
}));

import { listCredentials, getDecryptedCredentials } from "@/lib/credentials";
import { syncBank } from "@/lib/scraper";
import { startSyncRun } from "@/lib/sync/runs";
import { syncAllBanksClaimed } from "@/lib/sync";

async function drain(): Promise<unknown[]> {
  const run = syncAllBanksClaimed();
  if (!run) throw new Error("claim unexpectedly held");
  const events: unknown[] = [];
  for await (const event of run.events) events.push(event);
  return events;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listCredentials).mockResolvedValue([
    {
      id: RETIRED_CRED,
      bankType: RETIRED_ID,
      displayName: "retired account",
      createdAt: new Date(0),
    },
    { id: LIVE_CRED, bankType: "max", displayName: "live account", createdAt: new Date(0) },
  ]);
  vi.mocked(getDecryptedCredentials).mockImplementation(async (id) => ({
    bankType: id === RETIRED_CRED ? RETIRED_ID : "max",
    credentials: { username: "fake-user", password: "fake-password" },
  }));
  vi.mocked(syncBank).mockImplementation(async function* () {});
});

describe("sync of a credential whose institution is no longer registered", () => {
  it("uses an id the registry does not know", () => {
    expect(isBankType(RETIRED_ID)).toBe(false);
  });

  it("reports an unsupported-institution error for that row without scraping it", async () => {
    const events = await drain();

    expect(events).toContainEqual(
      expect.objectContaining({
        type: "bank_error",
        bank: RETIRED_ID,
        error: "מוסד לא נתמך",
        hasScreenshot: false,
        _credentialId: RETIRED_CRED,
      }),
    );
    expect(syncBank).not.toHaveBeenCalledWith(expect.anything(), RETIRED_ID, expect.anything());
    expect(startSyncRun).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ bank: RETIRED_ID }),
    );
  });

  it("still syncs the registered institutions after it", async () => {
    await drain();

    expect(syncBank).toHaveBeenCalledTimes(1);
    expect(syncBank).toHaveBeenCalledWith(expect.anything(), "max", expect.anything());
  });
});
