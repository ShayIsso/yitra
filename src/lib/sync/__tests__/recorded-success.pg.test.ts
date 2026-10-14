import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import { buildInstitutionsWithRecordedSuccessQuery, isRecordedSuccess } from "../runs";

/**
 * The evidence query against a real Postgres, pinning that it agrees with
 * `isRecordedSuccess`. Skipped unless `YITRA_PG_TEST_URL` names a migrated
 * throwaway database whose name starts with `yitra_wt` or `yitra_it`; it
 * deletes every `sync_runs` row, so it refuses any other name.
 *
 *   docker exec shayfinance-db-1 createdb -U shayfinance yitra_wt_check
 *   DATABASE_URL=…/yitra_wt_check npx drizzle-kit migrate
 *   YITRA_PG_TEST_URL=…/yitra_wt_check npx vitest run recorded-success.pg
 */
const url = process.env.YITRA_PG_TEST_URL;
const isThrowaway = !!url && /^\/yitra_(wt|it)/.test(new URL(url).pathname);

describe.skipIf(!isThrowaway)("institutions with a recorded successful sync on Postgres", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  const started = new Date("2026-01-15T08:00:00Z");
  const finished = new Date("2026-01-15T08:05:00Z");
  const runs = [
    { bank: "isracard", status: "success" as const, finishedAt: finished },
    { bank: "leumi", status: "success" as const, finishedAt: null },
    { bank: "amex", status: "error" as const, finishedAt: finished },
    { bank: "pagi", status: "otp_skipped" as const, finishedAt: finished },
    { bank: "isracard", status: "error" as const, finishedAt: finished },
  ];

  beforeAll(() => {
    client = postgres(url!, { max: 2 });
    db = drizzle(client, { schema });
  });

  beforeEach(async () => {
    await db.execute(sql`delete from sync_runs`);
  });

  afterAll(async () => {
    await db.execute(sql`delete from sync_runs`);
    await client.end();
  });

  it("returns each institution with a finished successful run once, and no other", async () => {
    await db.insert(schema.syncRuns).values(
      runs.map((run) => ({
        id: crypto.randomUUID(),
        startedAt: started,
        finishedAt: run.finishedAt ?? undefined,
        bank: run.bank,
        status: run.status,
        transactionsImported: 0,
        triggeredBy: "manual" as const,
      })),
    );

    const rows = await buildInstitutionsWithRecordedSuccessQuery({
      db,
      syncRuns: schema.syncRuns,
    });

    const expected = [...new Set(runs.filter(isRecordedSuccess).map((run) => run.bank))];
    expect(rows.map((row) => row.bank).sort()).toEqual(expected.sort());
    expect(expected).toEqual(["isracard"]);
  });
});
