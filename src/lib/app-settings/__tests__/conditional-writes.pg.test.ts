import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as schema from "@/db/schema";
import { buildClaimAppPasswordWrite, buildCompleteOnboardingWrite } from "../store";

/**
 * The conditional writes against a real Postgres — the one place their
 * concurrency guarantee can be observed. Skipped unless `YITRA_PG_TEST_URL`
 * names a migrated throwaway database whose name starts with `yitra_wt` or
 * `yitra_it`; it deletes the `app_settings` row, so it refuses any other name
 * rather than risk an install's real auth and onboarding state.
 *
 *   docker exec yitra-db-1 createdb -U yitra yitra_wt_check
 *   DATABASE_URL=…/yitra_wt_check npx drizzle-kit migrate
 *   YITRA_PG_TEST_URL=…/yitra_wt_check npx vitest run conditional-writes.pg
 */
const url = process.env.YITRA_PG_TEST_URL;
const isThrowaway = !!url && /^\/yitra_(wt|it)/.test(new URL(url).pathname);

describe.skipIf(!isThrowaway)("app-settings conditional writes on Postgres", () => {
  let client: ReturnType<typeof postgres>;
  let conn: {
    db: ReturnType<typeof drizzle<typeof schema>>;
    appSettings: typeof schema.appSettings;
  };

  const claim = (hash: string) =>
    buildClaimAppPasswordWrite(conn, hash, new Date()).then((rows) => rows.length > 0);
  const complete = () =>
    buildCompleteOnboardingWrite(conn, new Date(), new Date()).then((rows) => rows.length > 0);
  const storedRow = async () => (await conn.db.query.appSettings.findFirst()) ?? null;

  beforeAll(() => {
    client = postgres(url!, { max: 10 });
    conn = { db: drizzle(client, { schema }), appSettings: schema.appSettings };
  });

  beforeEach(async () => {
    await conn.db.execute(sql`delete from app_settings`);
  });

  afterAll(async () => {
    await conn.db.execute(sql`delete from app_settings`);
    await client.end();
  });

  it("claims the password on a fresh install with no settings row", async () => {
    expect(await claim("hash-first")).toBe(true);
    expect((await storedRow())?.appPasswordHash).toBe("hash-first");
  });

  it("claims the password when an empty settings row already exists", async () => {
    await conn.db.insert(conn.appSettings).values({ id: 1 });
    expect(await claim("hash-first")).toBe(true);
  });

  it("refuses a replay after the password is set, keeping the first hash", async () => {
    await claim("hash-first");
    expect(await claim("hash-replayed")).toBe(false);
    expect((await storedRow())?.appPasswordHash).toBe("hash-first");
  });

  it("refuses a replay after onboarding is complete, even with no hash stored", async () => {
    await complete();
    expect(await claim("hash-after-completion")).toBe(false);
    expect((await storedRow())?.appPasswordHash).toBeNull();
  });

  it.each([
    ["with no settings row", false],
    ["on an empty settings row", true],
  ])("lets exactly one of many simultaneous submissions win %s", async (_case, rowExists) => {
    if (rowExists) await conn.db.insert(conn.appSettings).values({ id: 1 });
    const hashes = Array.from({ length: 8 }, (_, i) => `hash-tab-${i}`);

    const results = await Promise.all(hashes.map((h) => claim(h).catch((err: unknown) => err)));

    const winners = hashes.filter((_, i) => results[i] === true);
    expect(winners).toHaveLength(1);
    expect(results.filter((r) => r === false)).toHaveLength(hashes.length - 1);
    expect((await storedRow())?.appPasswordHash).toBe(winners[0]);
  });

  it("records completion only once under simultaneous submissions", async () => {
    await claim("hash-first");
    const results = await Promise.all(Array.from({ length: 8 }, () => complete()));
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});
