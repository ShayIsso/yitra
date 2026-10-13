import { describe, it, expect } from "vitest";
import type { z } from "zod";
import { bankTypeSchema, type BankType } from "../index";

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

describe("bankTypeSchema", () => {
  it("accepts every registered institution id", () => {
    for (const id of ["discount", "max", "visaCal"]) {
      expect(bankTypeSchema.parse(id)).toBe(id);
    }
  });

  it("rejects an unregistered id with one Hebrew message", () => {
    const result = bankTypeSchema.safeParse("institution-that-was-removed");
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual(["מוסד לא נתמך"]);
  });

  it("rejects a non-string payload with that same message, not a second one", () => {
    for (const value of [undefined, null, 42, { id: "discount" }]) {
      const result = bankTypeSchema.safeParse(value);
      expect(result.error?.issues.map((issue) => issue.message)).toEqual(["מוסד לא נתמך"]);
    }
  });

  it("rejects an institution the scraper library supports but the registry excludes", () => {
    expect(bankTypeSchema.safeParse("oneZero").success).toBe(false);
  });

  it("matches ids exactly, so a differently cased or padded id is not registered", () => {
    for (const value of ["Discount", "visacal", " max", ""]) {
      expect(bankTypeSchema.safeParse(value).success).toBe(false);
    }
  });

  it("infers the registry's institution union, so a parsed id needs no cast", () => {
    const narrowed: Equals<z.output<typeof bankTypeSchema>, BankType> = true;
    expect(narrowed).toBe(true);
  });
});
