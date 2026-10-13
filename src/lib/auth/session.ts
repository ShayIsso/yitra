import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getEnv } from "@/lib/env";

export const SESSION_COOKIE = "yitra-session";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/**
 * The HMAC key is the hex-decoded `ENCRYPTION_KEY`. `validateSessionEdge` in
 * the middleware decodes it the same way; if either side used the raw string,
 * no token would ever validate.
 */
function sessionKey(): Buffer {
  return Buffer.from(getEnv().ENCRYPTION_KEY, "hex");
}

export function createSession(): string {
  const data = randomBytes(32).toString("hex");
  const sig = createHmac("sha256", sessionKey()).update(data).digest("hex");
  return `${data}.${sig}`;
}

export function validateSession(token: string): boolean {
  const dotIndex = token.indexOf(".");
  if (dotIndex === -1) return false;
  const data = token.slice(0, dotIndex);
  const sig = token.slice(dotIndex + 1);
  if (!data || !sig) return false;
  const expected = createHmac("sha256", sessionKey()).update(data).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

/**
 * The one definition of the session cookie, shared by every path that signs a
 * user in or out, so the login route and the setup wizard cannot drift apart.
 */
export function sessionCookie(token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  } as const;
}

export function expiredSessionCookie() {
  return { ...sessionCookie(""), maxAge: 0 } as const;
}

/** Signs the current request in. Callable only from a Server Action or route handler. */
export async function establishSession(): Promise<void> {
  (await cookies()).set(sessionCookie(createSession()));
}

export async function hasValidSession(): Promise<boolean> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token !== undefined && validateSession(token);
}

/**
 * The session check for code the middleware does not gate. A Server Action is
 * POSTed to the path of the page that rendered it, so every action in the
 * module graph of an auth-exempt page (`/login`, `/setup`) runs with no
 * middleware session check at all. Such an action must call this first.
 *
 * Without a valid session it ends the request in a redirect to sign in, and
 * `redirect` throws, so nothing after the call runs: it fails closed, and a
 * session that expired mid-wizard lands on the login form rather than a 500.
 * The throw is a control-flow signal a surrounding `catch` would swallow,
 * which is why the call must be the action's first statement and never inside
 * a `try` (`setup-action-guard.test.ts` enforces both).
 */
export async function requireSession(returnTo?: "/setup"): Promise<void> {
  if (await hasValidSession()) return;
  redirect(signInUrl(returnTo));
}

/** `/login`, optionally asking it to send the visitor back afterwards. */
export function signInUrl(returnTo?: "/setup"): string {
  return returnTo ? `/login?next=${encodeURIComponent(returnTo)}` : "/login";
}
