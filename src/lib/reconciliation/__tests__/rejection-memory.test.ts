import { describe, it, expect } from "vitest";
import { runPostImportPipeline } from "@/lib/sync/post-import";
import type { AiStepDeps } from "@/lib/sync/ai-step";
import { approveGroup, rejectGroup, undoTransaction } from "../inbox-ops";
import { isRejected, toRejectedPairs } from "../rejected-pairs";
import { createWorld, type WorldRow } from "./reconciliation-world";

async function sync(world: ReturnType<typeof createWorld>) {
  const events = [];
  for await (const e of runPostImportPipeline({
    reconciliationStore: world.reconciliation,
    runRecurring: async () => {},
    runAiStep: async function* () {},
    ai: {} as AiStepDeps,
    importSummary: { total: 0, byBank: {} },
  })) {
    events.push(e);
  }
  return events;
}

const row = (r: Partial<WorldRow> & Pick<WorldRow, "id">): WorldRow => ({
  bankAccountId: `acct-${r.id}`,
  bankType: "discount",
  date: "2026-01-15",
  chargedAmount: -40,
  description: "קפה",
  ...r,
});

describe("a rejected pair is not proposed again by the next sync", () => {
  it("P2 mirror", async () => {
    const world = createWorld([
      row({ id: "a", description: "ביט", chargedAmount: -40 }),
      row({ id: "b", description: "קפה", chargedAmount: -40 }),
    ]);

    await sync(world);
    const [group] = world.pendingGroups();
    expect(group).toBeDefined();

    await rejectGroup(group, world.inbox);
    await sync(world);

    expect(world.pendingGroups()).toEqual([]);
  });

  it("P3 inter-account", async () => {
    const world = createWorld([
      row({ id: "out", description: "ביט", chargedAmount: -75 }),
      row({ id: "in", description: "קפה", chargedAmount: 75 }),
    ]);

    await sync(world);
    const [group] = world.pendingGroups();
    expect(group).toBeDefined();

    await rejectGroup(group, world.inbox);
    await sync(world);

    expect(world.pendingGroups()).toEqual([]);
  });

  it("P1 settlement group", async () => {
    const world = createWorld([
      row({ id: "lump", description: "חיוב", chargedAmount: -300, bankAccountId: "bank" }),
      row({ id: "d1", bankType: "max", chargedAmount: -100, bankAccountId: "card" }),
      row({ id: "d2", bankType: "max", chargedAmount: -100, bankAccountId: "card" }),
      row({ id: "d3", bankType: "max", chargedAmount: -100, bankAccountId: "card" }),
    ]);

    await sync(world);
    const [group] = world.pendingGroups();
    expect(group).toBeDefined();

    await rejectGroup(group, world.inbox);
    await sync(world);

    expect(world.pendingGroups()).toEqual([]);
  });

  it("but a rejected row can still pair with a different counterpart", async () => {
    const world = createWorld([
      row({ id: "a", description: "ביט", chargedAmount: -40 }),
      row({ id: "b", description: "קפה", chargedAmount: -40 }),
    ]);
    await sync(world);
    await rejectGroup(world.pendingGroups()[0], world.inbox);

    world.addRow(row({ id: "c", description: "מכולת", chargedAmount: -40 }));
    await sync(world);

    expect(world.groupOf("a")).not.toBeNull();
    expect(world.groupOf("a")).toBe(world.groupOf("c"));
    expect(world.groupOf("b")).toBeNull();
  });

  it("P1: a new card row that would revive the rejected set does not", async () => {
    const world = createWorld([
      row({ id: "lump", description: "חיוב", chargedAmount: -300, bankAccountId: "bank" }),
      row({ id: "d1", bankType: "max", chargedAmount: -150, bankAccountId: "card" }),
      row({ id: "d2", bankType: "max", chargedAmount: -150, bankAccountId: "card" }),
    ]);
    await sync(world);
    await rejectGroup(world.pendingGroups()[0], world.inbox);

    // Without the memory {d1, d2, d3} = -303 stays within 2% of the lump.
    world.addRow(row({ id: "d3", bankType: "max", chargedAmount: -3, bankAccountId: "card" }));
    await sync(world);

    expect(world.pendingGroups()).toEqual([]);
  });

  it("P1: a disjoint new card set that sums to the lump is proposed for the same lump", async () => {
    const world = createWorld([
      row({ id: "lump", description: "חיוב", chargedAmount: -300, bankAccountId: "bank" }),
      row({ id: "d1", bankType: "max", chargedAmount: -150, bankAccountId: "card" }),
      row({ id: "d2", bankType: "max", chargedAmount: -150, bankAccountId: "card" }),
    ]);
    await sync(world);
    await rejectGroup(world.pendingGroups()[0], world.inbox);

    world.addRow(row({ id: "e1", bankType: "max", chargedAmount: -100, bankAccountId: "card" }));
    world.addRow(row({ id: "e2", bankType: "max", chargedAmount: -200, bankAccountId: "card" }));
    await sync(world);

    expect(world.groupOf("lump")).not.toBeNull();
    expect(world.groupOf("e1")).toBe(world.groupOf("lump"));
    expect(world.groupOf("e2")).toBe(world.groupOf("lump"));
    expect(world.groupOf("d1")).toBeNull();
  });

  it("P1: a second lump can still claim details rejected against the first", async () => {
    const world = createWorld([
      row({ id: "lump", description: "חיוב", chargedAmount: -300, bankAccountId: "bank" }),
      row({ id: "d1", bankType: "max", chargedAmount: -150, bankAccountId: "card" }),
      row({ id: "d2", bankType: "max", chargedAmount: -150, bankAccountId: "card" }),
    ]);
    await sync(world);
    await rejectGroup(world.pendingGroups()[0], world.inbox);

    world.addRow(
      row({ id: "lump2", description: "חיוב", chargedAmount: -300, bankAccountId: "bank" }),
    );
    await sync(world);

    expect(world.groupOf("lump2")).not.toBeNull();
    expect(world.groupOf("d1")).toBe(world.groupOf("lump2"));
    expect(world.groupOf("d2")).toBe(world.groupOf("lump2"));
  });
});

describe("undoing a reconciled row is a rejection", () => {
  const undo = async (world: ReturnType<typeof createWorld>, id: string) => {
    const members = await world.inbox.getGroupMembers(world.groupOf(id)!);
    return undoTransaction(id, members, world.inbox);
  };

  it("an auto-applied P2 pair is not re-applied or re-queued", async () => {
    const world = createWorld(
      [
        row({ id: "a", description: "ביט", chargedAmount: -40 }),
        row({ id: "b", description: "ביט", chargedAmount: -40 }),
      ],
      { transferCategory: true },
    );
    await sync(world);
    expect(world.confirmedGroups()).toHaveLength(1);

    await undo(world, "a");
    await sync(world);

    expect(world.pendingGroups()).toEqual([]);
  });

  it("a user-approved pair is not re-proposed", async () => {
    const world = createWorld([
      row({ id: "a", description: "ביט", chargedAmount: -40 }),
      row({ id: "b", description: "קפה", chargedAmount: -40 }),
    ]);
    await sync(world);
    await approveGroup(world.pendingGroups()[0], world.inbox);
    expect(world.confirmedGroups()).toHaveLength(1);

    await undo(world, "b");
    await sync(world);

    expect(world.pendingGroups()).toEqual([]);
  });

  it("an undone suspected-transfer singleton is remembered against itself", async () => {
    const world = createWorld([row({ id: "s", description: "העברה", chargedAmount: -90 })]);
    world.queueSuspected("s");

    await undo(world, "s");

    const remembered = toRejectedPairs(world.rejectedPairs());
    expect(isRejected(remembered, "s", "s")).toBe(true);
  });
});
