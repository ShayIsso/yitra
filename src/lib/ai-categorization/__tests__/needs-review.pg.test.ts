import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import { needsReviewSql } from "../review-store";

/**
 * The needs-review predicate against a real Postgres, in both query builders
 * that use it: the transactions listing reads rows through the relational
 * builder (`db.query.transactions.findMany`), which re-aliases every column it
 * finds in a `where`, and the attention count goes through `db.select`. Skipped
 * unless `YITRA_PG_TEST_URL` names a migrated throwaway database whose name
 * starts with `yitra_wt` or `yitra_it`; it deletes every bank credential (and
 * so every transaction), so it refuses any other name.
 *
 *   docker exec yitra-db-1 createdb -U yitra yitra_wt_check
 *   DATABASE_URL=…/yitra_wt_check npx drizzle-kit migrate
 *   YITRA_PG_TEST_URL=…/yitra_wt_check npx vitest run needs-review.pg
 */
const url = process.env.YITRA_PG_TEST_URL;
const isThrowaway = !!url && /^\/yitra_(wt|it)/.test(new URL(url).pathname);

describe.skipIf(!isThrowaway)("needsReviewSql on Postgres", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let pendingId: string;

  beforeAll(() => {
    client = postgres(url!, { max: 2 });
    db = drizzle(client, { schema });
  });

  beforeEach(async () => {
    await db.execute(sql`delete from bank_credentials`);
    await db.execute(sql`delete from categories where name = 'synthetic category'`);
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
    const row = (description: string) => ({
      bankAccountId: account.id,
      date: "2026-03-10",
      processedDate: "2026-03-10",
      description,
      originalAmount: "-10.00",
      originalCurrency: "ILS",
      chargedAmount: "-10.00",
      type: "normal" as const,
      status: "completed" as const,
    });
    const txns = await db
      .insert(schema.transactions)
      .values([row("awaiting review"), row("already accepted"), row("no suggestion")])
      .returning({ id: schema.transactions.id, description: schema.transactions.description });
    const [category] = await db
      .insert(schema.categories)
      .values({ name: "synthetic category", type: "expense", icon: "x", color: "#000000" })
      .returning({ id: schema.categories.id });
    const byName = new Map(txns.map((t) => [t.description, t.id]));
    pendingId = byName.get("awaiting review")!;
    await db.insert(schema.aiSuggestions).values([
      {
        transactionId: pendingId,
        categoryId: category.id,
        confidence: 5,
        model: "synthetic",
        status: "pending_review",
      },
      {
        transactionId: byName.get("already accepted")!,
        categoryId: category.id,
        confidence: 5,
        model: "synthetic",
        status: "accepted",
      },
    ]);
  });

  afterAll(async () => {
    await db.execute(sql`delete from bank_credentials`);
    await db.execute(sql`delete from categories where name = 'synthetic category'`);
    await client.end();
  });

  it("selects exactly the rows awaiting review through the relational builder", async () => {
    const rows = await db.query.transactions.findMany({ where: needsReviewSql() });
    expect(rows.map((r) => r.id)).toEqual([pendingId]);
  });

  it("selects exactly the rows awaiting review through a plain select", async () => {
    const rows = await db
      .select({ id: schema.transactions.id })
      .from(schema.transactions)
      .where(needsReviewSql());
    expect(rows.map((r) => r.id)).toEqual([pendingId]);
  });
});
