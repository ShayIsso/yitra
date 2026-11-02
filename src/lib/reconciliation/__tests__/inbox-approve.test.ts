import { describe, it, expect, vi, beforeEach } from "vitest";
import * as merchantMemory from "@/lib/merchant-memory";
import {
  approveGroup,
  approveGroups,
  type InboxStore,
  type InboxTransaction,
  type TransferFlip,
} from "../inbox-ops";

// Every merchant-memory function wrapped in a pass-through spy, so a test can
// pin that approving reaches none of them.
vi.mock("@/lib/merchant-memory", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return Object.fromEntries(
    Object.entries(actual).map(([name, value]) => [
      name,
      typeof value === "function" ? vi.fn(value as (...args: unknown[]) => unknown) : value,
    ]),
  );
});

const TRANSFER_CATEGORY = "cat-transfer";

function row(
  overrides: Partial<InboxTransaction> & Pick<InboxTransaction, "id">,
): InboxTransaction {
  return {
    bankAccountId: "acct-1",
    bankType: "discount",
    date: "2026-03-10",
    description: "העברה לחשבון שלי",
    chargedAmount: -800,
    categoryId: null,
    categorySource: null,
    reconciliationGroupId: `group-${overrides.id}`,
    reconciliationRole: "transfer_pair",
    reconciliationConfidence: 0.5,
    reconciliationConfirmedAt: null,
    createdAt: new Date("2026-03-10T08:00:00Z"),
    ...overrides,
  };
}

function storeOf(groups: Record<string, InboxTransaction[]>) {
  const confirmed: { groupId: string; flip: TransferFlip | null }[] = [];
  const store: InboxStore = {
    getGroupMembers: async (groupId) => groups[groupId] ?? [],
    getGroupMembersByIds: async () => new Map(),
    confirmGroup: async (groupId, _now, flip) => {
      confirmed.push({ groupId, flip });
    },
    clearGroup: async () => {},
    clearRows: async () => {},
    setCategory: async () => {},
    getCategoryIdByName: async (name) => (name === "העברה פנימית" ? TRANSFER_CATEGORY : null),
    getRulesOrderedByPriority: async () => [],
  };
  return { store, confirmed };
}

beforeEach(() => vi.clearAllMocks());

describe("approving a suspected transfer", () => {
  it.each(["user", "memory"] as const)(
    "keeps the category of a row the user categorized (%s) after it was queued",
    async (categorySource) => {
      const only = row({
        id: "salary",
        description: 'העברה מחברה לדוגמה בע"מ',
        chargedAmount: 12000,
        categoryId: "cat-income",
        categorySource,
      });
      const { store, confirmed } = storeOf({ g: [only] });

      expect(await approveGroup("g", store)).toEqual({});

      expect(confirmed).toEqual([{ groupId: "g", flip: null }]);
    },
  );

  it("marks an uncategorized row as an internal transfer with user provenance", async () => {
    const only = row({ id: "out" });
    const { store, confirmed } = storeOf({ g: [only] });

    await approveGroup("g", store);

    expect(confirmed).toEqual([
      {
        groupId: "g",
        flip: { txnId: "out", categoryId: TRANSFER_CATEGORY, categorySource: "user" },
      },
    ]);
  });

  it("re-labels a row whose category came from automation (ai), with user provenance", async () => {
    const only = row({ id: "out", categoryId: "cat-ai-guess", categorySource: "ai" });
    const { store, confirmed } = storeOf({ g: [only] });

    await approveGroup("g", store);

    expect(confirmed[0].flip).toEqual({
      txnId: "out",
      categoryId: TRANSFER_CATEGORY,
      categorySource: "user",
    });
  });

  it("writes no merchant memory", async () => {
    const only = row({ id: "out", description: "העברה לחשבון שלי" });
    const { store } = storeOf({ g: [only] });

    await approveGroup("g", store);

    const calledMemoryFunctions = Object.entries(merchantMemory)
      .filter(([, fn]) => vi.isMockFunction(fn) && fn.mock.calls.length > 0)
      .map(([name]) => name);
    expect(calledMemoryFunctions).toEqual([]);
  });
});

describe("approving a two-leg transfer pair", () => {
  it("flips the bank side to an internal transfer, recorded as the user's decision", async () => {
    const bankSide = row({ id: "bank", reconciliationGroupId: "pair", description: "העברה" });
    const cardSide = row({
      id: "card",
      reconciliationGroupId: "pair",
      bankType: "max",
      description: "ביט - חבר לדוגמה",
      chargedAmount: -800,
    });
    const { store, confirmed } = storeOf({ pair: [bankSide, cardSide] });

    await approveGroup("pair", store);

    expect(confirmed).toEqual([
      {
        groupId: "pair",
        flip: { txnId: "bank", categoryId: TRANSFER_CATEGORY, categorySource: "user" },
      },
    ]);
  });
});

describe("bulk approve", () => {
  it("never approves a singleton credit; it is reported as skipped for a one-by-one decision", async () => {
    const credit = row({
      id: "salary",
      reconciliationGroupId: "credit",
      description: 'העברה מחברה לדוגמה בע"מ',
      chargedAmount: 12000,
    });
    const debit = row({ id: "out", reconciliationGroupId: "debit" });
    const pairOut = row({ id: "p-out", reconciliationGroupId: "pair", description: "העברה" });
    const pairIn = row({
      id: "p-in",
      reconciliationGroupId: "pair",
      bankType: "max",
      description: "העברה",
      chargedAmount: 800,
    });
    const { store, confirmed } = storeOf({
      credit: [credit],
      debit: [debit],
      pair: [pairOut, pairIn],
    });

    const result = await approveGroups(["credit", "debit", "pair"], store);

    expect(result).toEqual({ skipped: ["credit"] });
    expect(confirmed.map((c) => c.groupId)).toEqual(["debit", "pair"]);
  });

  it("still approves a singleton credit on its own", async () => {
    const credit = row({ id: "salary", chargedAmount: 12000 });
    const { store, confirmed } = storeOf({ g: [credit] });

    expect(await approveGroup("g", store)).toEqual({});

    expect(confirmed.map((c) => c.groupId)).toEqual(["g"]);
  });
});
