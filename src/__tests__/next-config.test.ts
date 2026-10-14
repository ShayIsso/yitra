import { describe, it, expect } from "vitest";
import nextConfig from "../../next.config";

describe("next.config", () => {
  // Server Action arguments carry credentials, and the dev server logs them unless this is off.
  it("disables Server Function invocation logging", () => {
    expect(nextConfig.logging).toMatchObject({ serverFunctions: false });
  });
});
