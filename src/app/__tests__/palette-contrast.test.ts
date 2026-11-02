import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * WCAG AA for every text-on-surface pair the palette defines (ADR-0015
 * "Palette"), in both themes, read straight from globals.css so a token edit
 * that breaks contrast fails here.
 */

const css = readFileSync(join(__dirname, "..", "globals.css"), "utf8");

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`No ${selector} block in globals.css`);
  const body = css.slice(start, css.indexOf("\n}", start));
  return Object.fromEntries(
    [...body.matchAll(/^\s*(--[a-z0-9-]+):\s*([^;]+);/gm)].map((m) => [m[1], m[2].trim()]),
  );
}

const light = block(":root");
const dark = { ...light, ...block('[data-theme="dark"],\n.dark') };

function hex(tokens: Record<string, string>, name: string): string {
  const value = tokens[name];
  if (!value) throw new Error(`${name} is not defined`);
  const ref = value.match(/^var\((--[a-z0-9-]+)\)$/);
  if (ref) return hex(tokens, ref[1]);
  if (!/^#[0-9a-f]{6}$/i.test(value))
    throw new Error(`${name} must be a #rrggbb hex, got ${value}`);
  return value;
}

function luminance(color: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(color.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const SURFACES = ["--background", "--card", "--muted"];
const TEXT_ON_EVERY_SURFACE = [
  "--foreground",
  "--muted-foreground",
  "--pos",
  "--neg",
  "--destructive",
  "--attention-text",
];
const FILL_PAIRS: [text: string, fill: string][] = [
  ["--card-foreground", "--card"],
  ["--popover-foreground", "--popover"],
  ["--primary-foreground", "--primary"],
  ["--secondary-foreground", "--secondary"],
  ["--accent-foreground", "--accent"],
  ["--attention-foreground", "--attention"],
  ["--warning-foreground", "--warning"],
  ["--attention-text", "--attention-subtle"],
  ["--emerald-foreground", "--emerald"],
  ["--hero-foreground", "--hero"],
  ["--hero-muted", "--hero"],
  ["--sidebar-foreground", "--sidebar"],
  ["--sidebar-primary-foreground", "--sidebar-primary"],
  ["--sidebar-accent-foreground", "--sidebar-accent"],
];

const PAIRS: [string, string][] = [
  ...TEXT_ON_EVERY_SURFACE.flatMap((text) =>
    SURFACES.map((surface): [string, string] => [text, surface]),
  ),
  ...FILL_PAIRS,
];

describe.each([
  ["light", light],
  ["dark", dark],
])("palette contrast (%s)", (_theme, tokens) => {
  it.each(PAIRS)("%s on %s meets WCAG AA (4.5:1)", (text, surface) => {
    expect(contrast(hex(tokens, text), hex(tokens, surface))).toBeGreaterThanOrEqual(4.5);
  });
});
