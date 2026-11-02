import { describe, it, expect } from "vitest";
import { runPostImportPipeline } from "@/lib/sync/post-import";
import type { AiStepDeps } from "@/lib/sync/ai-step";
import { detectP3InterAccount } from "../detect-p3";
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

const LEGS: WorldRow[] = [
  {
    id: "in",
    bankAccountId: "acct-a",
    bankType: "discount",
    date: "2026-03-10",
    chargedAmount: 800,
    description: "העברה מחשבון 1",
  },
  {
    id: "out",
    bankAccountId: "acct-b",
    bankType: "discount",
    date: "2026-03-10",
    chargedAmount: -800,
    description: "העברה לחשבון 2",
  },
];

describe("a two-leg own-account transfer still pairs through P3", () => {
  it("is detected as a P3 inter-account candidate, incoming leg included", () => {
    const candidates = detectP3InterAccount(
      LEGS.map((r) => ({ ...r, categoryId: null, reconciliationGroupId: null })),
    );

    expect(candidates).toMatchObject([
      { kind: "p3_inter_account", outgoingSide: { id: "out" }, incomingSide: { id: "in" } },
    ]);
  });

  it("groups the incoming 'העברה מ…' leg with its outgoing counterpart on a sync", async () => {
    const world = createWorld(LEGS);

    await sync(world);

    const [group] = world.pendingGroups();
    expect(group).toBeDefined();
    expect(world.groupOf("in")).toBe(group);
    expect(world.groupOf("out")).toBe(group);
  });
});
