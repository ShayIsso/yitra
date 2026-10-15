import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import {
  recordRejections,
  selectUnpairedNotRejected,
  type RejectionExecutor,
} from "../rejection-writes";

/**
 * The rejection writes against a real Postgres: the CHECK, the cascade and the
 * router's NOT EXISTS cannot be observed through store fakes. Skipped unless
 * `YITRA_PG_TEST_URL` names a migrated throwaway database whose name starts with
 * `yitra_wt` or `yitra_it`; it deletes every bank credential (and so every
 * transaction), so it refuses any other name.
 *
 *   docker exec yitra-db-1 createdb -U yitra yitra_wt_check
 *   DATABASE_URL=…/yitra_wt_check npx drizzle-kit migrate
 *   YITRA_PG_TEST_URL=…/yitra_wt_check npx vitest run rejections.pg
 */
const url = process.env.YITRA_PG_TEST_URL;
const isThrowaway = !!url && /^\/yitra_(wt|it)/.test(new URL(url).pathname);

const T1 = "00000000-0000-4000-8000-000000000001";
const T2 = "00000000-0000-4000-8000-000000000002";
const T3 = "00000000-0000-4000-8000-000000000003";
const GONE = "00000000-0000-4000-8000-0000000000ff";

describe.skipIf(!isThrowaway)("reconciliation rejections on Postgres", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let executor: RejectionExecutor;

  const rejections = () => db.select().from(schema.reconciliationRejections);

  beforeAll(() => {
    client = postgres(url!, { max: 2 });
    db = drizzle(client, { schema });
    executor = db;
  });

  beforeEach(async () => {
    await db.execute(sql`delete from bank_credentials`);
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
    await db.insert(schema.transactions).values(
      [T1, T2, T3].map((id) => ({
        id,
        bankAccountId: account.id,
        date: "2026-01-15",
        processedDate: "2026-01-15",
        description: "synthetic",
        originalAmount: "-10.00",
        originalCurrency: "ILS",
        chargedAmount: "-10.00",
        type: "normal" as const,
        status: "completed" as const,
      })),
    );
  });

  afterAll(async () => {
    await db.execute(sql`delete from bank_credentials`);
    await client.end();
  });

  it("stores a pair lowest id first regardless of the order it was given", async () => {
    await recordRejections(executor, [[T2, T1]]);

    expect(await rejections()).toMatchObject([{ txnAId: T1, txnBId: T2 }]);
  });

  it("rejects a non-canonical raw insert with the CHECK", async () => {
    await expect(
      db.insert(schema.reconciliationRejections).values({ txnAId: T2, txnBId: T1 }),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
  });

  it("treats a duplicate reject as a no-op", async () => {
    await recordRejections(executor, [[T1, T2]]);
    await recordRejections(executor, [[T2, T1]]);

    expect(await rejections()).toHaveLength(1);
  });

  it("skips a pair whose transaction has vanished instead of failing", async () => {
    await recordRejections(executor, [
      [T1, GONE],
      [T1, T2],
    ]);

    expect(await rejections()).toMatchObject([{ txnAId: T1, txnBId: T2 }]);
  });

  it("cascades a rejection away when either transaction is deleted", async () => {
    await recordRejections(executor, [
      [T1, T2],
      [T2, T3],
      [T3, T3],
    ]);

    await db.delete(schema.transactions).where(sql`id = ${T2}`);

    expect(await rejections()).toMatchObject([{ txnAId: T3, txnBId: T3 }]);
  });

  it("filterUnpaired drops a self-rejected row and keeps the others", async () => {
    await recordRejections(executor, [
      [T1, T1],
      [T2, T3],
    ]);

    const kept = await selectUnpairedNotRejected(executor, [T1, T2, T3]);

    expect(kept.sort()).toEqual([T2, T3]);
  });
});
