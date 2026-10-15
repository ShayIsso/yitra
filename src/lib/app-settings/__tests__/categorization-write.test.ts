import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { DrizzleQueryError } from "drizzle-orm/errors";
import * as schema from "@/db/schema";
import { decrypt } from "@/lib/crypto";
import { makeDrizzleAppSettingsStore, type CategorizationSelection } from "..";

const SYNTHETIC_KEY = "fake-provider-key-for-tests-only-0000";
const TEST_ENCRYPTION_KEY = "ab".repeat(32);

type Captured = { values: Record<string, unknown>; set: Record<string, unknown> };

/** A connection that records what the write would bind, and can be told to fail. */
function recordingConnection(fail = false) {
  const writes: Captured[] = [];
  const db = {
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        onConflictDoUpdate: ({ set }: { set: Record<string, unknown> }) => {
          writes.push({ values, set });
          if (!fail) return Promise.resolve();
          return Promise.reject(
            new DrizzleQueryError(
              `insert into "app_settings" ("id", "categorization_api_key_encrypted") values ($1, $2)`,
              [1, values.categorizationApiKeyEncrypted, SYNTHETIC_KEY],
              new Error(`relation "app_settings" does not exist; detail: ${SYNTHETIC_KEY}`),
            ),
          );
        },
      }),
    }),
  };
  const open = async () => ({ db, appSettings: schema.appSettings }) as never;
  return { open, writes };
}

async function write(selection: CategorizationSelection) {
  const { open, writes } = recordingConnection();
  await makeDrizzleAppSettingsStore(open).setCategorization(selection);
  return writes[0];
}

function boundText(captured: Captured): string {
  return JSON.stringify([captured.values, captured.set], (_key, value) =>
    value && value.type === "Buffer" ? Buffer.from(value.data).toString("utf8") : value,
  );
}

beforeEach(() => {
  vi.stubEnv("ENCRYPTION_KEY", TEST_ENCRYPTION_KEY);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("setCategorization's write", () => {
  it("never binds the plaintext key", async () => {
    const captured = await write({ provider: "gemini", apiKey: SYNTHETIC_KEY });
    expect(boundText(captured)).not.toContain(SYNTHETIC_KEY);
  });

  it("binds a ciphertext that decrypts back to the key", async () => {
    const { set } = await write({ provider: "gemini", apiKey: SYNTHETIC_KEY });
    expect(
      decrypt({
        encrypted: set.categorizationApiKeyEncrypted as Buffer,
        iv: set.categorizationApiKeyIv as Buffer,
        authTag: set.categorizationApiKeyAuthTag as Buffer,
      }),
    ).toBe(SYNTHETIC_KEY);
  });

  it("uses a fresh IV on every write of the same key", async () => {
    const first = await write({ provider: "gemini", apiKey: SYNTHETIC_KEY });
    const second = await write({ provider: "gemini", apiKey: SYNTHETIC_KEY });
    expect(
      Buffer.compare(
        first.set.categorizationApiKeyIv as Buffer,
        second.set.categorizationApiKeyIv as Buffer,
      ),
    ).not.toBe(0);
  });

  it("clears all three key parts when the selection carries a null key", async () => {
    const { set } = await write({ provider: "off", apiKey: null });
    expect(set).toMatchObject({
      categorizationProvider: "off",
      categorizationApiKeyEncrypted: null,
      categorizationApiKeyIv: null,
      categorizationApiKeyAuthTag: null,
    });
  });

  it("leaves the stored key untouched when the selection omits it", async () => {
    const { set } = await write({ provider: "gemini" });
    expect(set.categorizationProvider).toBe("gemini");
    expect(set).not.toHaveProperty("categorizationApiKeyEncrypted");
    expect(set).not.toHaveProperty("categorizationApiKeyIv");
    expect(set).not.toHaveProperty("categorizationApiKeyAuthTag");
  });
});

describe("setCategorization when the database write fails", () => {
  async function rejection() {
    const { open } = recordingConnection(true);
    return makeDrizzleAppSettingsStore(open)
      .setCategorization({ provider: "gemini", apiKey: SYNTHETIC_KEY })
      .then(
        () => {
          throw new Error("expected the write to reject");
        },
        (err: unknown) => err as Error & { cause?: unknown; params?: unknown; query?: unknown },
      );
  }

  it("still rejects, so the caller cannot mistake a failure for a save", async () => {
    expect(await rejection()).toBeInstanceOf(Error);
  });

  it("carries no part of the key in its message, stack or cause", async () => {
    const err = await rejection();
    for (const surface of [err.message, err.stack ?? "", String(err.cause ?? "")]) {
      expect(surface).not.toContain(SYNTHETIC_KEY);
    }
  });

  it("carries neither the query nor its parameters", async () => {
    const err = await rejection();
    expect(err.cause).toBeUndefined();
    expect(err.params).toBeUndefined();
    expect(err.query).toBeUndefined();
    expect(JSON.stringify(err)).not.toContain(SYNTHETIC_KEY);
  });
});
