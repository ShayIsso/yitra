import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * WCAG AA (ADR-0015 "Palette") in both themes, read straight from globals.css:
 * every opaque text-on-surface pair, and every translucent tint the components
 * actually draw text on (alpha-composited over each surface it can sit on).
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
const darkScope = block('[data-theme="dark"],\n.dark');
const dark = { ...light, ...darkScope };

function hex(tokens: Record<string, string>, name: string): string {
  const value = tokens[name];
  if (!value) throw new Error(`${name} is not defined`);
  const ref = value.match(/^var\((--[a-z0-9-]+)\)$/);
  if (ref) return hex(tokens, ref[1]);
  if (!/^#[0-9a-f]{6}$/i.test(value))
    throw new Error(`${name} must be a #rrggbb hex, got ${value}`);
  return value;
}

function channels(color: string): number[] {
  return [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
}

function luminance(rgb: number[]): number {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: number[], b: number[]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `bg-<tint>/<alpha>` painted over `surface`, as the browser composites it. */
function composite(tint: string, alpha: number, surface: string): number[] {
  const [t, s] = [channels(tint), channels(surface)];
  return t.map((v, i) => v * alpha + s[i] * (1 - alpha));
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
  // Teal link and badge text (reports table toggle, "new" subscription badge).
  ["--primary", "--card"],
  ["--primary", "--background"],
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

type Tint = {
  text: string;
  tint: string;
  alphas: { light: number[]; dark: number[] };
  /** Defaults to every page surface; a hero-only tint is checked over the hero. */
  surfaces?: string[];
};

/**
 * Text drawn on translucent token fills, with every alpha (rest and hover) the
 * components use in each theme: the destructive button and badge
 * (ui/button.tsx, ui/badge.tsx), the budget chips (budget-status-card.tsx),
 * the toast variants (ui/toast.tsx), the amber count badges, on the hero
 * the entry screens' sheen, current step and control hover
 * (onboarding/entry-frame.tsx, onboarding/setup-frame.tsx) and the home
 * hero's chips, notes and the equation's result term at /15
 * (home/hero-states.tsx), and the sand
 * washes under the reports' expanded group rows (/40) and the subscriptions'
 * alert panels (/70).
 */
const TINTS: Tint[] = [
  {
    text: "--destructive",
    tint: "--destructive",
    alphas: { light: [0.1, 0.2], dark: [0.1, 0.15, 0.2] },
  },
  {
    text: "--foreground",
    tint: "--destructive",
    alphas: { light: [0.1, 0.2], dark: [0.1, 0.15, 0.2] },
  },
  { text: "--emerald", tint: "--emerald", alphas: { light: [0.1, 0.15], dark: [0.1, 0.15] } },
  { text: "--foreground", tint: "--emerald", alphas: { light: [0.1, 0.15], dark: [0.1, 0.15] } },
  { text: "--foreground", tint: "--warning", alphas: { light: [0.15], dark: [0.15] } },
  ...(
    [
      ["--hero-foreground", [0.1, 0.15]],
      ["--hero-muted", [0.1]],
    ] as const
  ).map(([text, alphas]) => ({
    text,
    tint: "--hero-foreground",
    alphas: { light: [...alphas], dark: [...alphas] },
    surfaces: ["--hero"],
  })),
  { text: "--foreground", tint: "--muted", alphas: { light: [0.4, 0.7], dark: [0.4, 0.7] } },
  { text: "--muted-foreground", tint: "--muted", alphas: { light: [0.4, 0.7], dark: [0.4, 0.7] } },
];

describe.each([
  ["light", light],
  ["dark", dark],
] as const)("palette contrast (%s)", (theme, tokens) => {
  it.each(PAIRS)("%s on %s meets WCAG AA (4.5:1)", (text, surface) => {
    const ratio = contrast(channels(hex(tokens, text)), channels(hex(tokens, surface)));
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });

  const tinted = TINTS.flatMap(({ text, tint, alphas, surfaces = SURFACES }) =>
    alphas[theme].flatMap((alpha) =>
      surfaces.map((surface): [string, string, number, string] => [text, tint, alpha, surface]),
    ),
  );
  it.each(tinted)("%s on %s/%s over %s meets WCAG AA (4.5:1)", (text, tint, alpha, surface) => {
    const fill = composite(hex(tokens, tint), alpha, hex(tokens, surface));
    expect(contrast(channels(hex(tokens, text)), fill)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("dark scope", () => {
  // A var() inside a custom property resolves where it is declared, so an
  // alias declared only on :root keeps its light value inside a nested
  // .dark scope. The resolver above cannot see that; this guard can.
  const aliases = Object.entries(light)
    .filter(([, value]) => /^var\(--[a-z0-9-]+\)$/.test(value))
    .map(([name]) => name)
    .filter((name) => !["--radius"].includes(name));

  it.each(aliases)("redeclares the %s alias", (name) => {
    expect(darkScope[name]).toBe(light[name]);
  });
});
