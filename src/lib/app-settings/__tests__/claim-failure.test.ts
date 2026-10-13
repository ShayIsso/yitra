import { describe, it, expect } from "vitest";
import { DrizzleQueryError } from "drizzle-orm/errors";
import * as schema from "@/db/schema";
import { makeDrizzleAppSettingsStore } from "../store";

/**
 * Drizzle wraps a failed statement in an error whose message and `params`
 * carry every bound value — for the claim, the bcrypt hash — and Next prints
 * an uncaught action error to stdout. Any database failure (outage, restart,
 * an unapplied migration) would therefore log the hash. The store must not let
 * that error escape.
 */
const SYNTHETIC_HASH = "$2b$12$syntheticclaimfailurehashplaceholderxxxxxxxxxxxxxxxx";

function failingConnection() {
  const failure = new DrizzleQueryError(
    `insert into "app_settings" ("id", "app_password_hash") values ($1, $2)`,
    [1, SYNTHETIC_HASH],
    new Error(`relation "app_settings" does not exist; detail: ${SYNTHETIC_HASH}`),
  );
  const rejecting = { returning: () => Promise.reject(failure) };
  const db = {
    insert: () => ({ values: () => ({ onConflictDoUpdate: () => rejecting }) }),
  };
  return async () => ({ db, appSettings: schema.appSettings }) as never;
}

async function claimRejection() {
  const store = makeDrizzleAppSettingsStore(failingConnection());
  return store.claimAppPassword(SYNTHETIC_HASH).then(
    () => {
      throw new Error("expected the claim to reject");
    },
    (err: unknown) => err as Error & { cause?: unknown; params?: unknown; query?: unknown },
  );
}

describe("claimAppPassword when the database write fails", () => {
  it("still rejects, so the caller cannot mistake a failure for a refusal", async () => {
    expect(await claimRejection()).toBeInstanceOf(Error);
  });

  it("carries no part of the hash in its message, stack or cause", async () => {
    const err = await claimRejection();
    const surfaces = [err.message, err.stack ?? "", String(err.cause ?? "")];
    for (const surface of surfaces) expect(surface).not.toContain(SYNTHETIC_HASH);
  });

  it("carries neither the query nor its parameters", async () => {
    const err = await claimRejection();
    expect(err.cause).toBeUndefined();
    expect(err.params).toBeUndefined();
    expect(err.query).toBeUndefined();
    expect(JSON.stringify(err)).not.toContain(SYNTHETIC_HASH);
  });
});
