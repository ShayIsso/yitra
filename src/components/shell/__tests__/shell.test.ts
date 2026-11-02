import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Rail } from "@/components/shell/rail";
import { TabBar } from "@/components/shell/tab-bar";
import {
  ArrowsLeftRightIcon,
  DotsThreeOutlineIcon,
  GearSixIcon,
  HouseIcon,
} from "@/components/icons";

const svg = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

function rail(pathname: string, pendingReconCount = 0) {
  return svg(createElement(Rail, { pathname, pendingReconCount }));
}

function tabBar(pathname: string, pendingReconCount = 0) {
  return svg(createElement(TabBar, { pathname, pendingReconCount }));
}

/** The destination list's `<a …>…</a>` linking to `href` (the brand link also goes home). */
function linkTo(html: string, href: string): string {
  const list = html.slice(html.indexOf("<ul"));
  const match = list.match(new RegExp(`<a[^>]*href="${href}"[^>]*>.*?</a>`));
  if (!match) throw new Error(`no link to ${href}`);
  return match[0];
}

describe("the desktop rail", () => {
  it("labels every destination with visible text", () => {
    const html = rail("/");
    for (const label of ["לוח בקרה", "תנועות", "דוחות", "התאמות", "מנויים", "סנכרון", "הגדרות"]) {
      expect(html).toContain(`>${label}</span>`);
    }
  });

  it("marks only the current page, drawing it in the fill weight", () => {
    const html = rail("/transactions");
    const current = linkTo(html, "/transactions");
    expect(current).toContain('aria-current="page"');
    expect(current).toContain(svg(createElement(ArrowsLeftRightIcon, { weight: "fill" })));
    const home = linkTo(html, "/");
    expect(home).not.toContain("aria-current");
    expect(home).toContain(svg(createElement(HouseIcon, { weight: "regular" })));
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
  });

  it("shows the pending reconciliation count in an attention badge, also read to screen readers", () => {
    const recon = linkTo(rail("/", 7), "/reconciliation");
    expect(recon).toMatch(/class="[^"]*bg-attention[^"]*">7<\/span>/);
    expect(recon).toContain("7 ממתינות");
  });

  it("shows no badge when nothing is pending", () => {
    expect(linkTo(rail("/", 0), "/reconciliation")).not.toContain("bg-attention");
  });

  it("keeps the brand mark and the theme toggle", () => {
    const html = rail("/");
    expect(html).toContain(">Yitra</a>");
    expect(html).toContain('aria-label="מעבר למצב כהה"');
  });
});

describe("the phone tab bar", () => {
  it("has the four primary tabs and a 'more' tab, and nothing else", () => {
    const html = tabBar("/");
    for (const href of ["/", "/transactions", "/reports", "/reconciliation"]) {
      expect(html).toContain(`href="${href}"`);
    }
    for (const href of ["/subscriptions", "/sync", "/settings"]) {
      expect(html).not.toContain(`href="${href}"`);
    }
    expect(html).toContain(">עוד</span>");
    expect(html).toMatch(/<button[^>]*data-slot="dialog-trigger"/);
  });

  it("badges the reconciliation tab, capping large counts", () => {
    const recon = linkTo(tabBar("/", 120), "/reconciliation");
    expect(recon).toContain(">99+</span>");
  });

  it("makes 'more' the active tab on a page that lives behind it", () => {
    const html = tabBar("/settings");
    expect(html).not.toContain('aria-current="page"');
    expect(html).toContain(svg(createElement(DotsThreeOutlineIcon, { weight: "fill" })));
    expect(html).not.toContain(svg(createElement(GearSixIcon, { weight: "fill" })));
  });

  it("leaves 'more' inactive on a page that has its own tab", () => {
    const html = tabBar("/reports");
    expect(linkTo(html, "/reports")).toContain('aria-current="page"');
    expect(html).toContain(svg(createElement(DotsThreeOutlineIcon, { weight: "regular" })));
  });
});
