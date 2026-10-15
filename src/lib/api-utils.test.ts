import { describe, it, expect } from "vitest";
import { isSameOriginRequest } from "./api-utils";

function headers(init: Record<string, string>) {
  return new Headers(init);
}

describe("isSameOriginRequest", () => {
  it("accepts a request the browser marks same-origin", () => {
    expect(isSameOriginRequest(headers({ "sec-fetch-site": "same-origin" }))).toBe(true);
  });

  it.each(["cross-site", "same-site", "none"])(
    "refuses a request the browser marks %s, whatever its Origin says",
    (site) => {
      expect(
        isSameOriginRequest(
          headers({
            "sec-fetch-site": site,
            origin: "http://localhost:3000",
            host: "localhost:3000",
          }),
        ),
      ).toBe(false);
    },
  );

  it("falls back to an Origin matching the Host when the browser sends no fetch metadata", () => {
    expect(
      isSameOriginRequest(headers({ origin: "http://localhost:3000", host: "localhost:3000" })),
    ).toBe(true);
  });

  it("refuses an Origin naming another host", () => {
    expect(
      isSameOriginRequest(headers({ origin: "http://elsewhere.test", host: "localhost:3000" })),
    ).toBe(false);
  });

  it("refuses an Origin on another port of the same host", () => {
    expect(
      isSameOriginRequest(headers({ origin: "http://localhost:4000", host: "localhost:3000" })),
    ).toBe(false);
  });

  it("refuses a request with neither fetch metadata nor an Origin", () => {
    expect(isSameOriginRequest(headers({ host: "localhost:3000" }))).toBe(false);
  });

  it("refuses an unparseable Origin", () => {
    expect(isSameOriginRequest(headers({ origin: "null", host: "localhost:3000" }))).toBe(false);
  });
});
