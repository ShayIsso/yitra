import type { BankRegistryEntry } from "../index";
import { registered } from "./registered";

/**
 * An institution shaped like none of the verified ones: a six-digit card field
 * and a distinct user code beside the password. Tests pass it through a seam;
 * it is never added to the production registry.
 */
export const syntheticIssuer = {
  ...registered("max"),
  id: "syntheticIssuer",
  credentialFields: [
    { key: "card6Digits", kind: "card-6-digits", label: "שש ספרות אחרונות" },
    { key: "userCode", kind: "text", label: "קוד משתמש" },
    { key: "password", kind: "password", label: "סיסמה" },
  ],
} as const satisfies BankRegistryEntry;
