import { describe, it, expect, afterEach } from "vitest";
import { syncClaim, syncClaimHeldSince } from "../process-claim";

describe("the process sync claim", () => {
  afterEach(() => syncClaim.release());

  it("is the one claim on globalThis, readable without loading the sync barrel", async () => {
    expect(syncClaimHeldSince()).toBeNull();
    expect(syncClaim.acquire()).toBe(true);
    const again = await import("../process-claim");
    expect(again.syncClaim.acquire()).toBe(false);
    expect(syncClaimHeldSince()).toBeInstanceOf(Date);
  });
});
