import { describe, it, expect } from "vitest";
import {
  rejectGroup,
  rejectGroups,
  undoTransaction,
  type InboxStore,
  type InboxTransaction,
} from "../inbox-ops";
import type { CategorySource } from "@/lib/merchant-memory";

const TRANSFER = "cat-transfer";
const SETTLEMENT = "cat-settlement";
const RENT = "cat-rent";
const RULE_RESULT = "cat-rule";

function row(id: string, overrides: Partial<InboxTransaction> = {}): InboxTransaction {
  return {
    id,
    bankAccountId: "acct-1",
    bankType: "discount",
    date: "2026-03-10",
    description: "משכנתא לדוגמה",
    chargedAmount: -800,
    categoryId: null,
    categorySource: null,
    reconciliationGroupId: "g",
    reconciliationRole: "transfer_pair",
    reconciliationConfidence: 0.5,
    reconciliationConfirmedAt: null,
    createdAt: new Date("2026-03-10T08:00:00Z"),
    ...overrides,
  };
}

/** In-memory store applying the same write-time guard as the Drizzle store. */
function storeOf(rows: InboxTransaction[]) {
  const state = new Map(rows.map((r) => [r.id, { ...r }]));
  const store: InboxStore = {
    getGroupMembers: async (g) => [...state.values()].filter((r) => r.reconciliationGroupId === g),
    getGroupMembersByIds: async () => new Map(),
    confirmGroup: async () => {},
    clearGroup: async (groupIds) => {
      for (const r of state.values()) {
        if (groupIds.includes(r.reconciliationGroupId ?? "")) r.reconciliationGroupId = null;
      }
    },
    clearRows: async (ids) => {
      for (const id of ids) state.get(id)!.reconciliationGroupId = null;
    },
    setCategory: async (id, categoryId, intent) => {
      const r = state.get(id)!;
      const user = r.categorySource === "user" || r.categorySource === "memory";
      const released = intent === "undo" && [TRANSFER, SETTLEMENT].includes(r.categoryId ?? "");
      if (user && !released) return;
      r.categoryId = categoryId;
      r.categorySource = categoryId === null ? null : "rule";
    },
    getCategoryIdByName: async () => null,
    getRulesOrderedByPriority: async () => [
      { id: "r", categoryId: RULE_RESULT, matchType: "contains", pattern: "משכנתא", priority: 0 },
    ],
  };
  return { store, state };
}

describe.each(["user", "memory"] as CategorySource[])("a %s-categorized row", (source) => {
  const labeled = () => row("a", { categoryId: RENT, categorySource: source });

  it("keeps its category when the group is rejected", async () => {
    const { store, state } = storeOf([labeled()]);
    await rejectGroup("g", store);
    expect(state.get("a")).toMatchObject({ categoryId: RENT, categorySource: source });
    expect(state.get("a")!.reconciliationGroupId).toBeNull();
  });

  it("keeps its category when bulk-rejected", async () => {
    const { store, state } = storeOf([labeled()]);
    await rejectGroups(["g"], store);
    expect(state.get("a")).toMatchObject({ categoryId: RENT, categorySource: source });
  });

  it("keeps its category when undone, including the remaining member of a pair", async () => {
    const a = labeled();
    const b = row("b", { categoryId: RENT, categorySource: source });
    const { store, state } = storeOf([a, b]);
    await undoTransaction("a", [a, b], store);
    expect(state.get("a")).toMatchObject({ categoryId: RENT, categorySource: source });
    expect(state.get("b")).toMatchObject({ categoryId: RENT, categorySource: source });
    expect(state.get("b")!.reconciliationGroupId).toBeNull();
  });
});

describe("rows without a user category", () => {
  it("still go back to the rule result or to uncategorized on reject", async () => {
    const ruled = row("a", { categoryId: "cat-old", categorySource: "rule" });
    const plain = row("b", { description: "ללא כלל" });
    const { store, state } = storeOf([ruled, plain]);
    await rejectGroup("g", store);
    expect(state.get("a")).toMatchObject({ categoryId: RULE_RESULT, categorySource: "rule" });
    expect(state.get("b")).toMatchObject({ categoryId: null, categorySource: null });
  });

  it("write the rule result to a row with no provenance on reject and undo", async () => {
    const a = row("a", { categoryId: RENT, categorySource: null });
    const b = row("b");
    const { store, state } = storeOf([a, b]);
    await undoTransaction("a", [a, b], store);
    expect(state.get("a")).toMatchObject({ categoryId: RULE_RESULT, categorySource: "rule" });
    expect(state.get("b")).toMatchObject({ categoryId: RULE_RESULT, categorySource: "rule" });
  });

  it("keep a user-labelled internal transfer on reject but release it on undo", async () => {
    const mk = () => row("a", { categoryId: TRANSFER, categorySource: "user" });
    const rejected = storeOf([mk()]);
    await rejectGroup("g", rejected.store);
    expect(rejected.state.get("a")).toMatchObject({ categoryId: TRANSFER, categorySource: "user" });

    const undone = storeOf([mk()]);
    await undoTransaction("a", [mk()], undone.store);
    expect(undone.state.get("a")).toMatchObject({ categoryId: RULE_RESULT });
  });

  it("release a stale-memory settlement category on undo", async () => {
    const lump = row("a", { categoryId: SETTLEMENT, categorySource: "memory" });
    const { store, state } = storeOf([lump]);
    await undoTransaction("a", [lump], store);
    expect(state.get("a")).toMatchObject({ categoryId: RULE_RESULT, categorySource: "rule" });
  });

  it("fetch the rules once for a bulk reject", async () => {
    const { store } = storeOf(
      [row("a"), row("b", {}), row("c")].map((r, i) => ({ ...r, reconciliationGroupId: `g${i}` })),
    );
    let calls = 0;
    const get = store.getRulesOrderedByPriority;
    store.getRulesOrderedByPriority = async () => (calls++, get());
    await rejectGroups(["g0", "g1", "g2"], store);
    expect(calls).toBe(1);
  });

  it("release an approved transfer flip (user provenance) on undo", async () => {
    const flipped = row("a", {
      categoryId: TRANSFER,
      categorySource: "user",
      reconciliationConfirmedAt: new Date(),
    });
    const { store, state } = storeOf([flipped]);
    await undoTransaction("a", [flipped], store);
    expect(state.get("a")).toMatchObject({ categoryId: RULE_RESULT, categorySource: "rule" });
  });
});
