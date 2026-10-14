import { describe, it, expect, vi } from "vitest";
import { runAiCategorization, type AiCategorizationStore, type UncategorizedTxn } from "../run";
import type { CategorizationProvider } from "../provider";
import type { MerchantMemoryStore } from "@/lib/merchant-memory";
import {
  HYPOTHETICAL_BANK,
  HYPOTHETICAL_CARD,
  UNREGISTERED,
} from "@/lib/bank-registry/__tests__/hypothetical-institutions";

vi.mock("@/lib/bank-registry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bank-registry")>();
  const { withHypotheticalInstitutions } =
    await import("@/lib/bank-registry/__tests__/hypothetical-institutions");
  return { ...actual, bankKindOf: withHypotheticalInstitutions(actual.bankKindOf) };
});

const SETTLEMENT_SHAPED = "חיוב חודשי";
const INTER_ACCOUNT_SHAPED = "העברה לחיסכון";

function storesServing(txns: UncategorizedTxn[]): {
  aiStore: AiCategorizationStore;
  memoryStore: MerchantMemoryStore;
} {
  const unused = () => {
    throw new Error("not reached when nothing is memorised or answered");
  };
  return {
    aiStore: {
      getUncategorizedTransactions: async () => txns,
      getPromptCategories: async () => [{ id: "c-1", name: "שונות", description: null }],
      getFewShotExamples: async () => [],
      getRecentAiCorrections: async () => [],
      getSuppressedPairs: async () => [],
      insertSuggestion: unused,
    },
    memoryStore: {
      findEntriesByKeys: async () => [],
      recordHits: async () => {},
      getEntry: unused,
      upsertEntry: unused,
      deleteAiTierEntry: unused,
      getTransaction: unused,
      getCategoryName: unused,
      getOverwritableTransactions: unused,
      categoryHasChildren: unused,
      setTransactionCategory: unused,
      restoreTransactionCategories: unused,
      appendCorrection: unused,
    },
  };
}

function silentProvider(): CategorizationProvider & { prompts: string[] } {
  const prompts: string[] = [];
  return {
    modelId: "test-model",
    prompts,
    async generate(prompt) {
      prompts.push(String(prompt));
      return JSON.stringify({ answers: [] });
    },
  };
}

async function guardedIds(txns: UncategorizedTxn[]) {
  const provider = silentProvider();
  const summary = await runAiCategorization({
    ...storesServing(txns),
    provider,
  });
  return { guarded: summary.transferSkippedIds, prompts: provider.prompts };
}

describe("runAiCategorization — transfer-guard kind scoping follows registry kind", () => {
  it("guards a settlement-shaped description from a bank institution added to the registry", async () => {
    const { guarded, prompts } = await guardedIds([
      { id: "t-bank", description: SETTLEMENT_SHAPED, bankType: HYPOTHETICAL_BANK },
    ]);

    expect(guarded).toEqual(["t-bank"]);
    expect(prompts).toEqual([]);
  });

  it("sends a settlement-shaped description from a card institution added to the registry to the provider", async () => {
    const { guarded, prompts } = await guardedIds([
      { id: "t-card", description: SETTLEMENT_SHAPED, bankType: HYPOTHETICAL_CARD },
    ]);

    expect(guarded).toEqual([]);
    expect(prompts.join("\n")).toContain(SETTLEMENT_SHAPED);
  });

  it("still guards a cross-account description from a card institution added to the registry", async () => {
    const { guarded } = await guardedIds([
      { id: "t-card", description: INTER_ACCOUNT_SHAPED, bankType: HYPOTHETICAL_CARD },
    ]);

    expect(guarded).toEqual(["t-card"]);
  });

  it("scopes an institution of unknown kind like a card, never widening its guard", async () => {
    const { guarded } = await guardedIds([
      { id: "t-settle", description: SETTLEMENT_SHAPED, bankType: UNREGISTERED },
      { id: "t-xfer", description: INTER_ACCOUNT_SHAPED, bankType: UNREGISTERED },
    ]);

    expect(guarded).toEqual(["t-xfer"]);
  });
});
