import { describe, it, expect, vi, beforeEach } from "vitest";
import * as merchantMemory from "@/lib/merchant-memory";
import {
  approveGroup,
  approveGroups,
  undoTransaction,
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
  const confirmed: { groupId: string; flips: TransferFlip[] }[] = [];
  const store: InboxStore = {
    getGroupMembers: async (groupId) => groups[groupId] ?? [],
    getGroupMembersByIds: async () => new Map(),
    confirmGroup: async (groupId, _now, flips) => {
      confirmed.push({ groupId, flips });
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

      expect(confirmed).toEqual([{ groupId: "g", flips: [] }]);
    },
  );

  it("marks an uncategorized row as an internal transfer with user provenance", async () => {
    const only = row({ id: "out" });
    const { store, confirmed } = storeOf({ g: [only] });

    await approveGroup("g", store);

    expect(confirmed).toEqual([
      {
        groupId: "g",
        flips: [
          {
            txnId: "out",
            categoryId: TRANSFER_CATEGORY,
            categorySource: "user",
            keepUserCategory: true,
          },
        ],
      },
    ]);
  });

  it("re-labels a row whose category came from automation (ai), with user provenance", async () => {
    const only = row({ id: "out", categoryId: "cat-ai-guess", categorySource: "ai" });
    const { store, confirmed } = storeOf({ g: [only] });

    await approveGroup("g", store);

    expect(confirmed[0].flips).toEqual([
      {
        txnId: "out",
        categoryId: TRANSFER_CATEGORY,
        categorySource: "user",
        keepUserCategory: true,
      },
    ]);
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
        flips: [
          {
            txnId: "bank",
            categoryId: TRANSFER_CATEGORY,
            categorySource: "user",
            keepUserCategory: false,
          },
        ],
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

  it("approves a zero-amount singleton in bulk: zero is not a credit", async () => {
    const zero = row({ id: "zero", reconciliationGroupId: "zero", chargedAmount: 0 });
    const { store, confirmed } = storeOf({ zero: [zero] });

    expect(await approveGroups(["zero"], store)).toEqual({ skipped: [] });
    expect(confirmed.map((c) => c.groupId)).toEqual(["zero"]);
  });

  it("still approves a singleton credit on its own", async () => {
    const credit = row({ id: "salary", chargedAmount: 12000 });
    const { store, confirmed } = storeOf({ g: [credit] });

    expect(await approveGroup("g", store)).toEqual({});

    expect(confirmed.map((c) => c.groupId)).toEqual(["g"]);
  });
});

describe("approving an own-account transfer (P3)", () => {
  function ownAccountPair(overrides: Partial<InboxTransaction> = {}) {
    const out = row({
      id: "out",
      reconciliationGroupId: "p3",
      bankType: "discount",
      chargedAmount: -2500,
      reconciliationConfidence: 0.9,
      ...overrides,
    });
    const incoming = row({
      id: "in",
      reconciliationGroupId: "p3",
      bankType: "discount",
      bankAccountId: "acct-2",
      chargedAmount: 2500,
      reconciliationConfidence: 0.9,
      createdAt: new Date("2026-03-10T09:00:00Z"),
    });
    return [out, incoming];
  }

  it("flips both legs to internal transfers, each recorded as the user's decision", async () => {
    const { store, confirmed } = storeOf({ p3: ownAccountPair() });

    await approveGroup("p3", store);

    const leg = (txnId: string) => ({
      txnId,
      categoryId: TRANSFER_CATEGORY,
      categorySource: "user",
      keepUserCategory: false,
    });
    expect(confirmed).toEqual([{ groupId: "p3", flips: [leg("out"), leg("in")] }]);
  });

  it("flips both legs when both are bank accounts, whichever was created first", async () => {
    const [out, incoming] = ownAccountPair();
    const { store, confirmed } = storeOf({ p3: [incoming, out] });

    await approveGroup("p3", store);

    expect(confirmed[0].flips.map((f) => f.txnId).sort()).toEqual(["in", "out"]);
  });

  it.each(["user", "memory"] as const)(
    "flips a leg whatever its source (%s): a pair has a second leg to double-count against",
    async (categorySource) => {
      const pair = ownAccountPair({ categoryId: "cat-income", categorySource });
      const { store, confirmed } = storeOf({ p3: pair });

      await approveGroup("p3", store);

      expect(confirmed[0].flips).toHaveLength(2);
      expect(confirmed[0].flips.every((f) => !f.keepUserCategory)).toBe(true);
    },
  );

  it("never re-types opposite-sign settlement details left over from an undone lump", async () => {
    const left = [
      row({ id: "d1", reconciliationGroupId: "s", reconciliationRole: "settlement_detail" }),
      row({
        id: "d2",
        reconciliationGroupId: "s",
        reconciliationRole: "settlement_detail",
        chargedAmount: 800,
      }),
    ];
    const { store, confirmed } = storeOf({ s: left });

    await approveGroup("s", store);

    expect(confirmed).toEqual([{ groupId: "s", flips: [] }]);
  });

  it("flips both legs through bulk approve too", async () => {
    const { store, confirmed } = storeOf({ p3: ownAccountPair() });

    await approveGroups(["p3"], store);

    expect(confirmed[0].flips).toHaveLength(2);
  });

  it("writes no flips when the internal-transfer category does not exist", async () => {
    const { store, confirmed } = storeOf({ p3: ownAccountPair() });
    store.getCategoryIdByName = async () => null;

    await approveGroup("p3", store);

    expect(confirmed).toEqual([{ groupId: "p3", flips: [] }]);
  });
});

describe("undoing an approved own-account transfer", () => {
  it("clears both legs and re-runs the rules on each", async () => {
    const cleared: string[] = [];
    const recategorized: string[] = [];
    const { store } = storeOf({});
    store.clearRows = async (ids) => {
      cleared.push(...ids);
    };
    store.setCategory = async (id) => {
      recategorized.push(id);
    };
    const members = [
      row({ id: "out", reconciliationGroupId: "p3", chargedAmount: -2500 }),
      row({ id: "in", reconciliationGroupId: "p3", chargedAmount: 2500 }),
    ];

    await undoTransaction("out", members, store);

    expect(cleared.sort()).toEqual(["in", "out"]);
    expect(recategorized.sort()).toEqual(["in", "out"]);
  });
});
