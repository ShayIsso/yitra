import { ZodError } from "zod";

export function formatZodError(error: ZodError): string {
  return error.issues.map((e) => e.message).join(", ");
}

/** Field name → first validation message for that field ("root" for form-level issues). */
export type FieldErrors = Record<string, string>;

/**
 * Per-field companion to formatZodError, for Server Actions whose clients
 * surface validation failures as inline field errors (the shared form layer).
 */
export function formatZodFieldErrors(error: ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "root";
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}

/**
 * Cross-site request refusal for a cookie-authenticated mutation that is not a
 * Server Action (Server Actions get Next's own Origin check; route handlers do
 * not). Trusts the browser's `Sec-Fetch-Site` when present, else requires an
 * `Origin` naming this host. A request proving neither is refused, since only a
 * browser carries the session cookie this guards.
 */
export function isSameOriginRequest(headers: Headers): boolean {
  const site = headers.get("sec-fetch-site");
  if (site !== null) return site === "same-origin";

  const origin = headers.get("origin");
  const host = headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
