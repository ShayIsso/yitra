import { describe, it, expect } from "vitest";
import { MORE_DESTINATIONS, TAB_DESTINATIONS, badgeText, isActive } from "@/components/shell";

describe("the shell's destinations", () => {
  it("gives the phone tab bar home, transactions, reports and reconciliation, in that order", () => {
    expect(TAB_DESTINATIONS.map((d) => d.href)).toEqual([
      "/",
      "/transactions",
      "/reports",
      "/reconciliation",
    ]);
  });

  it("puts subscriptions, sync and settings behind 'more'", () => {
    expect(MORE_DESTINATIONS.map((d) => d.href)).toEqual(["/subscriptions", "/sync", "/settings"]);
  });

  it("keeps every page the sidebar linked to reachable", () => {
    const hrefs = [...TAB_DESTINATIONS, ...MORE_DESTINATIONS].map((d) => d.href);
    for (const page of [
      "/",
      "/transactions",
      "/reports",
      "/reconciliation",
      "/subscriptions",
      "/sync",
      "/settings",
    ]) {
      expect(hrefs).toContain(page);
    }
  });
});

describe("isActive", () => {
  it("matches home only on the exact root path", () => {
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/", "/transactions")).toBe(false);
  });

  it("matches a section on its own path and on nested paths", () => {
    expect(isActive("/settings", "/settings")).toBe(true);
    expect(isActive("/settings", "/settings/rules")).toBe(true);
  });

  it("does not match a different section that merely shares a prefix", () => {
    expect(isActive("/sync", "/synchronize")).toBe(false);
    expect(isActive("/reports", "/reports-archive")).toBe(false);
  });
});

describe("badgeText", () => {
  it("is null when nothing is pending, so no badge renders", () => {
    expect(badgeText(0)).toBeNull();
    expect(badgeText(-2)).toBeNull();
  });

  it("shows the count up to 99", () => {
    expect(badgeText(1)).toBe("1");
    expect(badgeText(99)).toBe("99");
  });

  it("caps larger counts at 99+", () => {
    expect(badgeText(100)).toBe("99+");
  });
});
