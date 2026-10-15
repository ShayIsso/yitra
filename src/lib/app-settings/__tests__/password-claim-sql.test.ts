import { describe, it, expect } from "vitest";
import { buildClaimAppPasswordWrite } from "../store";

/**
 * The first-run password write is reachable without a session (`/setup` is
 * exempt from the auth gate, ADR-0014 §4), so the predicate in this statement
 * is the only thing standing between an open port and a password reset. A Store
 * fake can only restate it as check-then-act; this pins what the database runs.
 */
const SYNTHETIC_HASH = "synthetic-bcrypt-hash-placeholder";

async function claimSql() {
  const [{ db }, { appSettings }] = await Promise.all([import("@/db"), import("@/db/schema")]);
  return buildClaimAppPasswordWrite(
    { db, appSettings },
    SYNTHETIC_HASH,
    new Date("2026-03-04T00:00:00.000Z"),
  ).toSQL();
}

describe("claimAppPassword SQL", () => {
  it("applies the update only while no hash is stored and onboarding is not complete", async () => {
    const { sql } = await claimSql();
    expect(sql).toContain(
      'do update set "app_password_hash" = $4, "updated_at" = $5 ' +
        'where ("app_settings"."app_password_hash" is null ' +
        'and "app_settings"."onboarding_completed_at" is null)',
    );
  });

  it("upserts on the singleton id rather than inserting a second row", async () => {
    const { sql } = await claimSql();
    expect(sql).toContain('on conflict ("id") do update');
  });

  it("returns the affected row, so zero rows can mean the claim was refused", async () => {
    const { sql } = await claimSql();
    expect(sql).toMatch(/returning "id"$/);
  });

  it("binds the hash as a parameter rather than inlining it into the statement", async () => {
    const { sql, params } = await claimSql();
    expect(sql).not.toContain(SYNTHETIC_HASH);
    expect(params).toContain(SYNTHETIC_HASH);
  });
});
