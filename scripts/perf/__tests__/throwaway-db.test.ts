import { describe, it, expect } from "vitest";
import { assertThrowawayDatabase } from "../throwaway-db";

const url = (name: string) => `postgres://u:p@localhost:5432/${name}`;

describe("assertThrowawayDatabase", () => {
  it("accepts databases named as throwaway", () => {
    expect(assertThrowawayDatabase(url("yitra_perf"))).toBe(url("yitra_perf"));
    expect(assertThrowawayDatabase(url("yitra_t314"))).toBe(url("yitra_t314"));
  });

  it("refuses the dev database and any other name", () => {
    for (const name of ["yitra", "yitra_dev", "perf", "yitra_t", "postgres", ""]) {
      expect(() => assertThrowawayDatabase(url(name))).toThrow(/Refusing/);
    }
  });

  it("refuses when DATABASE_URL is unset", () => {
    expect(() => assertThrowawayDatabase(undefined)).toThrow(/must be set/);
  });
});
