import { describe, it, expect } from "vitest";
import { createImportCategorizer } from "../categorizer";
import {
  deriveMerchantKey,
  type MemoryEntry,
  type MerchantMemoryStore,
} from "@/lib/merchant-memory";

const SALARY = 'העברה מחברה לדוגמה בע"מ';

function memoryHolding(entries: MemoryEntry[]): MerchantMemoryStore {
  const unused = () => {
    throw new Error("the import seam only reads memory");
  };
  return {
    findEntriesByKeys: async (keys) => entries.filter((e) => keys.includes(e.merchantKey)),
    recordHits: async () => {},
    getEntry: unused,
    upsertEntry: unused,
    deleteAiTierEntry: unused,
    getTransaction: unused,
    getCategoryName: unused,
    categoryHasChildren: unused,
    getOverwritableTransactions: unused,
    setTransactionCategory: unused,
    restoreTransactionCategories: unused,
    appendCorrection: unused,
  };
}

describe("the import-seam categorizer", () => {
  it("resolves a transfer-shaped credit the user labelled before from user-tier memory, so the AI step never sees it", async () => {
    const categorize = createImportCategorizer(
      [],
      memoryHolding([
        { merchantKey: deriveMerchantKey(SALARY), categoryId: "cat-income", source: "user" },
      ]),
    );

    expect(await categorize(SALARY)).toEqual({ categoryId: "cat-income", source: "memory" });
  });

  it("leaves it uncategorized when memory has no entry for its key", async () => {
    const categorize = createImportCategorizer([], memoryHolding([]));

    expect(await categorize(SALARY)).toEqual({ categoryId: null, source: null });
  });
});
