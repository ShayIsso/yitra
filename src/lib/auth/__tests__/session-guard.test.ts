import { describe, it, expect, vi, beforeEach } from "vitest";

const cookieJar = new Map<string, string>();
const setCookie = vi.fn();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = cookieJar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: setCookie,
  }),
}));

class RedirectSignal extends Error {}

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
}));

import {
  SESSION_COOKIE,
  createSession,
  establishSession,
  expiredSessionCookie,
  hasValidSession,
  requireSession,
  resolvePasswordSource,
  sessionCookie,
  validateSession,
} from "..";

beforeEach(() => {
  cookieJar.clear();
  setCookie.mockClear();
});

describe("resolvePasswordSource", () => {
  it("reports the environment when the override is set, even with a stored hash", () => {
    expect(resolvePasswordSource(true, true)).toBe("environment");
  });

  it("reports the stored hash when only the wizard has set one", () => {
    expect(resolvePasswordSource(false, true)).toBe("stored");
  });

  it("reports none on a fresh install", () => {
    expect(resolvePasswordSource(false, false)).toBe("none");
  });
});

describe("session cookie", () => {
  it("is http-only, same-site lax, site-wide and lasts thirty days", () => {
    expect(sessionCookie("token-value")).toEqual({
      name: SESSION_COOKIE,
      value: "token-value",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 2_592_000,
    });
  });

  it("expires immediately and carries no token when signing out", () => {
    expect(expiredSessionCookie()).toMatchObject({ name: SESSION_COOKIE, value: "", maxAge: 0 });
  });

  it("signs the request in with a token the node-side validator accepts", async () => {
    await establishSession();

    const written = setCookie.mock.calls[0][0];
    expect(written).toMatchObject({ name: SESSION_COOKIE, httpOnly: true, path: "/" });
    expect(validateSession(written.value)).toBe(true);
  });
});

describe("requireSession", () => {
  it("passes a request carrying a valid session", async () => {
    cookieJar.set(SESSION_COOKIE, createSession());
    await expect(requireSession()).resolves.toBeUndefined();
    await expect(hasValidSession()).resolves.toBe(true);
  });

  it("ends a request with no session cookie in a redirect to sign in", async () => {
    await expect(requireSession()).rejects.toEqual(new RedirectSignal("/login"));
    await expect(hasValidSession()).resolves.toBe(false);
  });

  it("sends the visitor back to the wizard after signing in when asked to", async () => {
    await expect(requireSession("/setup")).rejects.toEqual(
      new RedirectSignal("/login?next=%2Fsetup"),
    );
  });

  it("redirects a session whose signature was forged", async () => {
    const [data] = createSession().split(".");
    cookieJar.set(SESSION_COOKIE, `${data}.${"0".repeat(64)}`);
    await expect(requireSession()).rejects.toBeInstanceOf(RedirectSignal);
  });

  it("redirects a cookie that is not a token at all", async () => {
    cookieJar.set(SESSION_COOKIE, "not-a-token");
    await expect(requireSession()).rejects.toBeInstanceOf(RedirectSignal);
  });
});
