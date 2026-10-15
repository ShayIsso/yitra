import { describe, it, expect } from "vitest";
import { runPostImportPipeline } from "@/lib/sync/post-import";
import type { AiStepDeps } from "@/lib/sync/ai-step";
import { rejectGroup } from "../inbox-ops";
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

  it("P1: a new card row does not revive a rejected settlement group", async () => {
    const world = createWorld([
      row({ id: "lump", description: "חיוב", chargedAmount: -300, bankAccountId: "bank" }),
      row({ id: "d1", bankType: "max", chargedAmount: -150, bankAccountId: "card" }),
      row({ id: "d2", bankType: "max", chargedAmount: -150, bankAccountId: "card" }),
    ]);
    await sync(world);
    await rejectGroup(world.pendingGroups()[0], world.inbox);

    world.addRow(row({ id: "d3", bankType: "max", chargedAmount: -20, bankAccountId: "card" }));
    await sync(world);

    expect(world.pendingGroups()).toEqual([]);
  });
});
