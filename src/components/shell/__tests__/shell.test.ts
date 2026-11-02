import { describe, it, expect, vi } from "vitest";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ArrowsLeftRightIcon,
  DotsThreeOutlineIcon,
  GearSixIcon,
  HouseIcon,
} from "@/components/icons";

let currentPath = "/";
vi.mock("next/navigation", () => ({ usePathname: () => currentPath }));

import { AppShell } from "@/components/shell";

const markup = (el: ReactElement) => renderToStaticMarkup(el);
const fill = (icon: typeof HouseIcon) => markup(createElement(icon, { weight: "fill" }));
const regular = (icon: typeof HouseIcon) => markup(createElement(icon, { weight: "regular" }));

/** Renders the shell at `pathname` and splits it into its two navigation landmarks. */
function renderShell(pathname: string, pendingReconCount = 0) {
  currentPath = pathname;
  const html = markup(
    createElement(AppShell, { pendingReconCount }, createElement("p", null, "page body")),
  );
  const navs = [...html.matchAll(/<nav aria-label="([^"]*)"[^>]*>(.*?)<\/nav>/g)];
  expect(navs).toHaveLength(2);
  const [rail, tabBar] = navs;
  return { html, rail: rail[2], railLabel: rail[1], tabBar: tabBar[2], tabBarLabel: tabBar[1] };
}

/** The `<a>` (or "more" `<button>`) list item whose text includes `label`. */
function item(nav: string, label: string): string {
  const found = [...nav.matchAll(/<li[^>]*>(.*?)<\/li>/g)]
    .map((m) => m[1])
    .find((li) => li.includes(`>${label}<`));
  if (!found) throw new Error(`no nav item labelled ${label}`);
  return found;
}

/** What a sighted user reads on each item: no screen-reader-only text, no decorative badge. */
const visibleLabels = (nav: string) =>
  [...nav.matchAll(/<li[^>]*>(.*?)<\/li>/g)].map((m) =>
    m[1]
      .replace(/<span class="sr-only">.*?<\/span>/g, "")
      .replace(/<span aria-hidden="true"[^>]*>.*?<\/span>/g, "")
      .replace(/<[^>]+>/g, ""),
  );

describe("the app shell", () => {
  it("renders the page inside a main landmark that the skip link targets", () => {
    const { html } = renderShell("/");
    expect(html).toMatch(/<a href="#main-content"[^>]*>דילוג לתוכן<\/a>/);
    expect(html).toMatch(/<main id="main-content"[^>]*>.*page body.*<\/main>/);
  });

  it("names both navigation landmarks", () => {
    const { railLabel, tabBarLabel } = renderShell("/");
    expect(railLabel).toBe("ניווט ראשי");
    expect(tabBarLabel).toBe("ניווט ראשי");
  });

  it("keeps the brand link home and the theme toggle", () => {
    const { html, rail } = renderShell("/");
    expect(html.match(/<a[^>]*href="\/"[^>]*>(?:(?!<\/a>).)*Yitra<\/a>/g)?.length).toBe(2);
    expect(rail).toContain('aria-label="מעבר למצב כהה"');
  });
});

describe("the desktop rail", () => {
  it("labels every destination with visible text, home included as בית", () => {
    expect(visibleLabels(renderShell("/").rail)).toEqual([
      "בית",
      "תנועות",
      "דוחות",
      "התאמות",
      "מנויים",
      "סנכרון",
      "הגדרות",
    ]);
  });

  it("marks only the current page, drawing it in the fill weight", () => {
    const { rail } = renderShell("/transactions");
    const current = item(rail, "תנועות");
    expect(current).toContain('aria-current="page"');
    expect(current).toContain(fill(ArrowsLeftRightIcon));
    expect(item(rail, "בית")).not.toContain("aria-current");
    expect(item(rail, "בית")).toContain(regular(HouseIcon));
    expect(rail.match(/aria-current="page"/g)).toHaveLength(1);
  });

  it("announces the pending reconciliation count and shows it in a decorative badge", () => {
    const recon = item(renderShell("/", 7).rail, "התאמות");
    expect(recon).toMatch(/<span aria-hidden="true"[^>]*>7<\/span>/);
    expect(recon).toMatch(/<span class="sr-only">, 7 ממתינות<\/span>/);
  });

  it("shows no badge when nothing is pending", () => {
    const recon = item(renderShell("/", 0).rail, "התאמות");
    expect(recon).not.toContain('aria-hidden="true" class');
    expect(recon).not.toContain("ממתינות");
  });
});

describe("the phone tab bar", () => {
  it("has the four primary tabs and a 'more' dialog trigger, and nothing else", () => {
    const { tabBar } = renderShell("/");
    expect(visibleLabels(tabBar)).toEqual(["בית", "תנועות", "דוחות", "התאמות", "עוד"]);
    for (const href of ["/subscriptions", "/sync", "/settings"]) {
      expect(tabBar).not.toContain(`href="${href}"`);
    }
    expect(item(tabBar, "עוד")).toMatch(/<button[^>]*data-slot="dialog-trigger"/);
  });

  it("caps a large pending count at 99+", () => {
    expect(item(renderShell("/", 120).tabBar, "התאמות")).toContain(", 99+ ממתינות");
  });

  it("puts the current page on 'more' when it lives behind it, by name and in fill weight", () => {
    const more = item(renderShell("/settings").tabBar, "עוד");
    expect(more).toMatch(/<button[^>]*aria-current="page"/);
    expect(more).toContain('<span class="sr-only">, הגדרות</span>');
    expect(more).toContain(fill(DotsThreeOutlineIcon));
    expect(renderShell("/settings").tabBar).not.toContain(fill(GearSixIcon));
  });

  it("leaves 'more' unmarked on a page that has its own tab", () => {
    const { tabBar } = renderShell("/reports");
    expect(item(tabBar, "דוחות")).toContain('aria-current="page"');
    const more = item(tabBar, "עוד");
    expect(more).not.toContain("aria-current");
    expect(more).toContain(regular(DotsThreeOutlineIcon));
  });
});
