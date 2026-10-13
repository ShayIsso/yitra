import { describe, it, expect, vi } from "vitest";
import { establishInitialPassword, initialPasswordSchema } from "..";

/**
 * The claim itself is the database's conditional write (pinned by its SQL in
 * app-settings and exercised against Postgres in the integration suite). These
 * cases pin what wraps it: the override check that must refuse before any
 * write, and how a refused claim is reported.
 */
function claimingStore(claimed: boolean) {
  return { claimAppPassword: vi.fn(async () => claimed) };
}

const fakeHash = vi.fn(async (password: string) => `hashed:${password.length}`);

describe("establishInitialPassword", () => {
  it("stores the hash, not the password, and reports the claim", async () => {
    const store = claimingStore(true);
    const outcome = await establishInitialPassword("synthetic-password", {
      hasEnvironmentOverride: false,
      store,
      hash: fakeHash,
    });

    expect(outcome).toBe("set");
    expect(store.claimAppPassword).toHaveBeenCalledWith("hashed:18");
  });

  it("reports a refused claim as already set", async () => {
    const outcome = await establishInitialPassword("synthetic-password", {
      hasEnvironmentOverride: false,
      store: claimingStore(false),
      hash: fakeHash,
    });
    expect(outcome).toBe("already-set");
  });

  it("refuses without writing while the environment override is set", async () => {
    const store = claimingStore(true);
    const outcome = await establishInitialPassword("synthetic-password", {
      hasEnvironmentOverride: true,
      store,
      hash: fakeHash,
    });

    expect(outcome).toBe("environment-override");
    expect(store.claimAppPassword).not.toHaveBeenCalled();
  });

  it("hashes with bcrypt by default", async () => {
    const store = claimingStore(true);
    await establishInitialPassword("synthetic-password", { hasEnvironmentOverride: false, store });

    const bcrypt = await import("bcrypt");
    const [stored] = store.claimAppPassword.mock.calls[0] as unknown as [string];
    expect(stored).not.toContain("synthetic-password");
    await expect(bcrypt.compare("synthetic-password", stored)).resolves.toBe(true);
  });
});

describe("initialPasswordSchema", () => {
  it("accepts a password confirmed by an identical second entry", () => {
    expect(
      initialPasswordSchema.safeParse({
        password: "synthetic-pass",
        confirmation: "synthetic-pass",
      }).success,
    ).toBe(true);
  });

  it("rejects a confirmation that differs, on the confirmation field", () => {
    const result = initialPasswordSchema.safeParse({
      password: "synthetic-pass",
      confirmation: "synthetic-pasS",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["confirmation"]);
  });

  it("rejects a password shorter than eight characters", () => {
    const result = initialPasswordSchema.safeParse({
      password: "short12",
      confirmation: "short12",
    });
    expect(result.error?.issues[0].path).toEqual(["password"]);
  });

  it("rejects a password longer than bcrypt reads, rather than silently truncating it", () => {
    const long = "a".repeat(73);
    const result = initialPasswordSchema.safeParse({ password: long, confirmation: long });
    expect(result.error?.issues[0].path).toEqual(["password"]);
  });

  it("measures that limit in bytes, so a Hebrew password cannot slip past it", () => {
    const hebrew = "א".repeat(37);
    const result = initialPasswordSchema.safeParse({ password: hebrew, confirmation: hebrew });
    expect(result.success).toBe(false);
  });

  it("accepts a password at exactly the bcrypt limit", () => {
    const limit = "a".repeat(72);
    expect(initialPasswordSchema.safeParse({ password: limit, confirmation: limit }).success).toBe(
      true,
    );
  });
});
