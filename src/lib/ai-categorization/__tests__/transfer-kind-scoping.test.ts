import { describe, it, expect } from "vitest";
import { runAiCategorization, type AiCategorizationStore, type UncategorizedTxn } from "../run";
import type { CategorizationProvider } from "../provider";
import type { MerchantMemoryStore } from "@/lib/merchant-memory";
import { bankKindOf, type BankKind, type BankType } from "@/lib/bank-registry";

// Ids no registry entry carries. Transaction rows are typed by the registered
// union, so the ids are widened through `string`; the resolver below is the only
// thing that gives them a kind, standing in for a future registry entry.
const EXTRA_CARD = "hypothetical-card-issuer" as string as BankType;
const EXTRA_BANK = "hypothetical-account-bank" as string as BankType;
const UNKNOWN = "institution-with-no-entry" as string as BankType;

function withHypotheticalInstitutions(id: string): BankKind | undefined {
  if (id === EXTRA_CARD) return "card";
  if (id === EXTRA_BANK) return "bank";
  return bankKindOf(id);
}

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
    kindOf: withHypotheticalInstitutions,
  });
  return { guarded: summary.transferSkippedIds, prompts: provider.prompts };
}

describe("runAiCategorization — transfer-guard kind scoping follows registry kind", () => {
  it("guards a settlement-shaped description from a bank institution added to the registry", async () => {
    const { guarded, prompts } = await guardedIds([
      { id: "t-bank", description: SETTLEMENT_SHAPED, bankType: EXTRA_BANK },
    ]);

    expect(guarded).toEqual(["t-bank"]);
    expect(prompts).toEqual([]);
  });

  it("sends a settlement-shaped description from a card institution added to the registry to the provider", async () => {
    const { guarded, prompts } = await guardedIds([
      { id: "t-card", description: SETTLEMENT_SHAPED, bankType: EXTRA_CARD },
    ]);

    expect(guarded).toEqual([]);
    expect(prompts.join("\n")).toContain(SETTLEMENT_SHAPED);
  });

  it("still guards a cross-account description from a card institution added to the registry", async () => {
    const { guarded } = await guardedIds([
      { id: "t-card", description: INTER_ACCOUNT_SHAPED, bankType: EXTRA_CARD },
    ]);

    expect(guarded).toEqual(["t-card"]);
  });

  it("scopes an institution of unknown kind like a card, never widening its guard", async () => {
    const { guarded } = await guardedIds([
      { id: "t-settle", description: SETTLEMENT_SHAPED, bankType: UNKNOWN },
      { id: "t-xfer", description: INTER_ACCOUNT_SHAPED, bankType: UNKNOWN },
    ]);

    expect(guarded).toEqual(["t-xfer"]);
  });
});
