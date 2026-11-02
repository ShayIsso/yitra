import { describe, it, expect, afterEach, vi } from "vitest";
import { syncClaim, syncClaimHeldSince } from "../process-claim";

describe("the process sync claim", () => {
  afterEach(() => syncClaim.release());

  it("is one claim on globalThis, shared by a separately loaded copy of the module", async () => {
    expect(syncClaimHeldSince()).toBeNull();
    expect(syncClaim.acquire()).toBe(true);
    // A fresh module instance stands in for another Next.js bundle.
    vi.resetModules();
    const otherBundle = await import("../process-claim");
    expect(otherBundle.syncClaim.acquire()).toBe(false);
    expect(otherBundle.syncClaimHeldSince()).toBeInstanceOf(Date);
  });
});
