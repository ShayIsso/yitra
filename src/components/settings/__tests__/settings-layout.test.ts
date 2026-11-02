import { describe, it, expect, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SETTINGS_SECTIONS, SECTION_TITLES, type SettingsSection } from "../sections";

let query = "";
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(query),
  useRouter: () => ({ refresh: () => undefined }),
}));

import { SettingsLayout } from "../settings-layout";

const panes = {} as Record<SettingsSection, ReactNode>;
for (const section of SETTINGS_SECTIONS) {
  panes[section] = createElement("p", null, `pane:${section}`);
}

function render(search: string) {
  query = search;
  return renderToStaticMarkup(
    createElement(SettingsLayout, {
      panes,
      summaries: { rules: { kind: "text", text: "3 כללים" } },
    }),
  );
}

/** The pane wrapper around `section`'s content, with its attributes. */
function paneTag(html: string, section: SettingsSection): string {
  const match = html.match(new RegExp(`<div([^>]*)><p>pane:${section}</p></div>`));
  if (!match) throw new Error(`no pane for ${section}`);
  return match[1];
}

const navTag = (html: string) => html.match(/<nav([^>]*)>/)![1];

function navRow(html: string, section: SettingsSection): string {
  const match = html.match(new RegExp(`<a id="settings-nav-${section}"[^>]*>`));
  if (!match) throw new Error(`no nav row for ${section}`);
  return match[0];
}

describe("the settings layout", () => {
  it("lists every section as a link to its own URL", () => {
    const html = render("");
    for (const section of SETTINGS_SECTIONS) {
      expect(navRow(html, section)).toContain(`href="/settings?section=${section}"`);
      expect(html).toContain(SECTION_TITLES[section]);
    }
  });

  it("shows the grouped list on a phone and the default section beside it on a wide screen", () => {
    const html = render("");
    expect(navTag(html)).not.toContain("max-md:hidden");
    expect(html).toMatch(/<div class="min-w-0 md:max-w-3xl max-md:hidden">/);
    expect(paneTag(html, "accounts")).not.toContain("hidden");
    for (const section of SETTINGS_SECTIONS.filter((s) => s !== "accounts")) {
      expect(paneTag(html, section)).toContain("hidden");
    }
  });

  it("drills into the section the URL names, hiding the list on a phone", () => {
    const html = render("section=rules");
    expect(navTag(html)).toContain("max-md:hidden");
    expect(html).toMatch(/<div class="min-w-0 md:max-w-3xl">/);
    expect(paneTag(html, "rules")).not.toContain("hidden");
    expect(paneTag(html, "accounts")).toContain("hidden");
    expect(navRow(html, "rules")).toContain('aria-current="true"');
    expect(navRow(html, "accounts")).not.toContain("aria-current");
  });

  it("keeps the page heading for screen readers while a phone shows a section", () => {
    expect(render("section=goals")).toMatch(
      /<header class="[^"]*max-md:sr-only[^"]*"><h1[^>]*>הגדרות<\/h1>/,
    );
    expect(render("")).not.toContain("max-md:sr-only");
  });

  it("treats an unknown section like none", () => {
    expect(render("section=nope")).toBe(render(""));
  });

  it("keeps every section mounted so drilling out never drops an open form", () => {
    const html = render("section=budgets");
    for (const section of SETTINGS_SECTIONS) expect(html).toContain(`pane:${section}`);
  });

  it("shows each section's summary in the list", () => {
    expect(render("")).toMatch(/id="settings-nav-rules".*?3 כללים.*?<\/a>/);
  });
});
