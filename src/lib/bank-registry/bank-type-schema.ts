import { z } from "zod";
import { isBankType, type BankType } from "./entries";

/**
 * The one Zod rule for an institution id arriving at a boundary, so every
 * boundary shares one Hebrew message instead of writing its own.
 *
 * `z.custom` rather than `z.string().refine(isBankType)`: the refine form reports
 * a non-string payload with Zod's own English message, a second message beside
 * this one.
 */
export const bankTypeSchema = z.custom<BankType>(
  (value) => typeof value === "string" && isBankType(value),
  { error: "מוסד לא נתמך" },
);
