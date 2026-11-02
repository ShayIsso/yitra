import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { sql, eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { approveGroup } from "../inbox-ops";
import { drizzleInboxStore } from "../inbox-store";

/**
 * Approving through the real Drizzle inbox store. Skipped unless
 * `YITRA_PG_TEST_URL` names a migrated throwaway database whose name starts with
 * `yitra_wt` or `yitra_it`; it deletes every bank credential (and so every
 * transaction) and every merchant-memory entry, so it refuses any other name.
 *
 *   docker exec yitra-db-1 createdb -U yitra yitra_wt_check
 *   DATABASE_URL=…/yitra_wt_check npx drizzle-kit migrate
 *   YITRA_PG_TEST_URL=…/yitra_wt_check npx vitest run inbox-store.pg
 */
const url = process.env.YITRA_PG_TEST_URL;
const isThrowaway = !!url && /^\/yitra_(wt|it)/.test(new URL(url).pathname);

// The store writes through the app's `db`; point it at the throwaway database.
vi.mock("@/db", async () => {
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { default: postgres } = await import("postgres");
  const s = await import("@/db/schema");
  const client = postgres(process.env.YITRA_PG_TEST_URL ?? "postgres://unused@localhost/none", {
    max: 2,
  });
  return { db: drizzle(client, { schema: s }), client };
});

const GROUP = "00000000-0000-4000-8000-0000000000a1";
const ROW = "00000000-0000-4000-8000-000000000011";

describe.skipIf(!isThrowaway)("approving a suspected transfer on Postgres", () => {
  let db: Awaited<typeof import("@/db")>["db"];
  let transferCategoryId: string;
  let incomeCategoryId: string;

  beforeEach(async () => {
    ({ db } = await import("@/db"));
    await db.execute(sql`delete from bank_credentials`);
    await db.execute(sql`delete from merchant_memory`);
    await db.execute(
      sql`delete from categories where name in ('העברה פנימית', 'synthetic income')`,
    );
    [{ id: transferCategoryId }] = await db
      .insert(schema.categories)
      .values({ name: "העברה פנימית", type: "transfer", icon: "x", color: "#000000" })
      .returning({ id: schema.categories.id });
    [{ id: incomeCategoryId }] = await db
      .insert(schema.categories)
      .values({ name: "synthetic income", type: "income", icon: "x", color: "#000000" })
      .returning({ id: schema.categories.id });
    const [credential] = await db
      .insert(schema.bankCredentials)
      .values({
        bankType: "discount",
        displayName: "synthetic",
        encryptedCredentials: Buffer.from("x"),
        iv: Buffer.from("x"),
        authTag: Buffer.from("x"),
      })
      .returning({ id: schema.bankCredentials.id });
    const [account] = await db
      .insert(schema.bankAccounts)
      .values({ credentialId: credential.id, accountNumber: "000" })
      .returning({ id: schema.bankAccounts.id });
    await db.insert(schema.transactions).values({
      id: ROW,
      bankAccountId: account.id,
      date: "2026-03-10",
      processedDate: "2026-03-10",
      description: "העברה לחשבון שלי",
      originalAmount: "-800.00",
      originalCurrency: "ILS",
      chargedAmount: "-800.00",
      type: "normal",
      status: "completed",
      reconciliationGroupId: GROUP,
      reconciliationRole: "transfer_pair",
      reconciliationConfidence: 0.5,
    });
  });

  afterAll(async () => {
    if (!isThrowaway) return;
    const { db: d, client } = (await import("@/db")) as unknown as {
      db: typeof db;
      client: { end(): Promise<void> };
    };
    await d.execute(sql`delete from bank_credentials`);
    await d.execute(sql`delete from categories where name in ('העברה פנימית', 'synthetic income')`);
    await client.end();
  });

  const stored = async () =>
    (await db.select().from(schema.transactions).where(eq(schema.transactions.id, ROW)))[0];

  it("records the internal transfer as the user's decision and writes no merchant memory", async () => {
    expect(await approveGroup(GROUP, drizzleInboxStore)).toEqual({});

    const row = await stored();
    expect(row.reconciliationConfirmedAt).not.toBeNull();
    expect(row.categoryId).toBe(transferCategoryId);
    expect(row.categorySource).toBe("user");
    expect(await db.select().from(schema.merchantMemory)).toEqual([]);
  });

  it("keeps a category the user chose after the row was queued", async () => {
    await db
      .update(schema.transactions)
      .set({ categoryId: incomeCategoryId, categorySource: "user" })
      .where(eq(schema.transactions.id, ROW));

    await approveGroup(GROUP, drizzleInboxStore);

    const row = await stored();
    expect(row.reconciliationConfirmedAt).not.toBeNull();
    expect(row.categoryId).toBe(incomeCategoryId);
    expect(row.categorySource).toBe("user");
  });
});
