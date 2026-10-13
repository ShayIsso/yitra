import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * `getEnv` memoizes, so each case re-imports the module against a fresh
 * `process.env` rather than sharing a cached parse.
 */
async function loadAuth(appPassword: string | undefined) {
  vi.resetModules();
  if (appPassword === undefined) delete process.env.APP_PASSWORD;
  else process.env.APP_PASSWORD = appPassword;
  return import("../index");
}

const ORIGINAL_APP_PASSWORD = process.env.APP_PASSWORD;

/** A password-hash reader standing in for the app-settings store. */
function storedHash(hash: string | null) {
  const reader = { readAppPasswordHash: vi.fn(async () => hash) };
  return reader;
}

const NO_STORED_HASH = storedHash(null);

afterEach(() => {
  if (ORIGINAL_APP_PASSWORD === undefined) delete process.env.APP_PASSWORD;
  else process.env.APP_PASSWORD = ORIGINAL_APP_PASSWORD;
});

describe("verifyPassword — legacy APP_PASSWORD override (ADR-0014 §2)", () => {
  it("fails closed when no override is set and no hash is stored", async () => {
    const { verifyPassword } = await loadAuth(undefined);
    // Resolving false rather than rejecting is the point: without the guard,
    // bcrypt.compare receives undefined and throws a 500 out of the login route.
    await expect(verifyPassword("any-password", NO_STORED_HASH)).resolves.toBe(false);
  });

  it("fails closed when the override is blank and no hash is stored", async () => {
    const { verifyPassword } = await loadAuth("");
    await expect(verifyPassword("any-password", NO_STORED_HASH)).resolves.toBe(false);
  });

  it("accepts the password matching the override hash", async () => {
    const bcrypt = await import("bcrypt");
    const hash = await bcrypt.hash("correct-horse", 4);
    const { verifyPassword } = await loadAuth(hash);
    await expect(verifyPassword("correct-horse")).resolves.toBe(true);
  });

  it("rejects a password not matching the override hash", async () => {
    const bcrypt = await import("bcrypt");
    const hash = await bcrypt.hash("correct-horse", 4);
    const { verifyPassword } = await loadAuth(hash);
    await expect(verifyPassword("wrong-password")).resolves.toBe(false);
  });
});

describe("verifyPassword — stored hash (ADR-0014 §2)", () => {
  it("accepts the password matching the stored hash when no override is set", async () => {
    const bcrypt = await import("bcrypt");
    const { verifyPassword } = await loadAuth(undefined);
    const store = storedHash(await bcrypt.hash("stored-password", 4));
    await expect(verifyPassword("stored-password", store)).resolves.toBe(true);
  });

  it("rejects a password not matching the stored hash", async () => {
    const bcrypt = await import("bcrypt");
    const { verifyPassword } = await loadAuth(undefined);
    const store = storedHash(await bcrypt.hash("stored-password", 4));
    await expect(verifyPassword("wrong-password", store)).resolves.toBe(false);
  });

  it("falls through a blank override to the stored hash", async () => {
    const bcrypt = await import("bcrypt");
    const { verifyPassword } = await loadAuth("");
    const store = storedHash(await bcrypt.hash("stored-password", 4));
    await expect(verifyPassword("stored-password", store)).resolves.toBe(true);
  });

  it("lets the override win over a stored hash, so the stored password stops working", async () => {
    const bcrypt = await import("bcrypt");
    const { verifyPassword } = await loadAuth(await bcrypt.hash("override-password", 4));
    const store = storedHash(await bcrypt.hash("stored-password", 4));

    await expect(verifyPassword("stored-password", store)).resolves.toBe(false);
    await expect(verifyPassword("override-password", store)).resolves.toBe(true);
  });

  it("does not read the database at all while the override is set", async () => {
    const bcrypt = await import("bcrypt");
    const { verifyPassword } = await loadAuth(await bcrypt.hash("override-password", 4));
    const store = storedHash(null);

    await verifyPassword("override-password", store);
    expect(store.readAppPasswordHash).not.toHaveBeenCalled();
  });
});

describe("session tokens", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("validates a token it just created", async () => {
    const { createSession, validateSession } = await import("../index");
    expect(validateSession(createSession())).toBe(true);
  });

  it("rejects a token whose signature was tampered with", async () => {
    const { createSession, validateSession } = await import("../index");
    const token = createSession();
    const [data] = token.split(".");
    expect(validateSession(`${data}.${"0".repeat(64)}`)).toBe(false);
  });

  it("rejects a token with no signature separator", async () => {
    const { validateSession } = await import("../index");
    expect(validateSession("no-separator-here")).toBe(false);
  });
});
