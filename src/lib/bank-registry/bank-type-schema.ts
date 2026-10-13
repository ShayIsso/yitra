import { z } from "zod";
import { isBankType, type BankType } from "./entries";

/**
 * The one Zod rule for an institution id arriving at a boundary, so every
 * boundary shares one Hebrew message instead of writing its own.
 *
 * `z.custom` so a single predicate carries the single message: the
 * `z.string().refine(isBankType)` form reports a non-string payload with Zod's
 * own English message unless the message is repeated on the string step too.
 */
export const bankTypeSchema = z.custom<BankType>(
  (value) => typeof value === "string" && isBankType(value),
  { error: "מוסד לא נתמך" },
);
