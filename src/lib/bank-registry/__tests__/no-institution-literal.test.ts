import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "fs";
import path from "path";
import { CompanyTypes } from "israeli-bank-scrapers-core/lib/definitions";
import { bankRegistry } from "../index";
import {
  describeViolations,
  findInstitutionLiterals,
  type SourceFileInput,
} from "./institution-literal-scanner";

const REPO_ROOT = path.resolve(__dirname, "../../../..");
const SCANNED_ROOTS = ["src", "scripts"];

/**
 * Deriving the ids from the library, not only the registry, is what makes this a
 * guard: an institution registered tomorrow is covered the moment it is added,
 * and one the library knows but we have not registered yet cannot leak in early.
 */
const KNOWN_IDS: ReadonlySet<string> = new Set([
  ...Object.values(CompanyTypes),
  ...bankRegistry.map((entry) => entry.id),
  ...bankRegistry.flatMap((entry) => [entry.nameHe, entry.nameEn]),
]);

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function applicationSources(): SourceFileInput[] {
  return SCANNED_ROOTS.flatMap((root) => walk(path.join(REPO_ROOT, root))).map((absolute) => ({
    path: path.relative(REPO_ROOT, absolute).split(path.sep).join("/"),
    text: readFileSync(absolute, "utf8"),
  }));
}

describe("no institution id outside the bank registry (ADR-0013 law 1)", () => {
  it("finds no institution id literal in application source", () => {
    const violations = findInstitutionLiterals(applicationSources(), KNOWN_IDS);
    if (violations.length > 0) throw new Error(describeViolations(violations));
  });
});

const SAMPLE_IDS: ReadonlySet<string> = new Set(["discount", "max", "visaCal", "union"]);

function scan(sourcePath: string, text: string) {
  return findInstitutionLiterals([{ path: sourcePath, text }], SAMPLE_IDS);
}

describe("the guard's reach", () => {
  it("knows every library institution, including ones the registry omits", () => {
    expect(KNOWN_IDS.has("oneZero")).toBe(true);
    for (const entry of bankRegistry) expect(KNOWN_IDS.has(entry.id)).toBe(true);
  });

  it("walks the real application source, including the scraper it must not exempt wholesale", () => {
    const paths = applicationSources().map((source) => source.path);
    expect(paths.length).toBeGreaterThan(100);
    expect(paths).toContain("src/lib/scraper/index.ts");
  });
});

describe("the guard's rule", () => {
  it("flags an id in a string, template, JSX text, JSX attribute and type position", () => {
    const found = scan(
      "src/components/unrelated.tsx",
      [
        `const a = "discount";`,
        "const b = `max`;",
        "const d = `${n}union`;",
        `type T = "visaCal" | "other";`,
        `export const E = () => <p kind="max">discount</p>;`,
      ].join("\n"),
    );
    expect(found.map((f) => [f.line, f.literal])).toEqual([
      [1, "discount"],
      [2, "max"],
      [3, "union"],
      [4, "visaCal"],
      [5, "max"],
      [5, "discount"],
    ]);
  });

  it("flags a quoted key and a table keyed by institution id", () => {
    const found = scan(
      "src/lib/unrelated.ts",
      [
        `const quoted = { "max": 1 };`,
        `const table = { discount: 1, visaCal: 2, other: 3 };`,
        `type Row = { max: number; union: number };`,
      ].join("\n"),
    );
    expect(found.map((f) => [f.line, f.literal])).toEqual([
      [1, "max"],
      [2, "discount"],
      [2, "visaCal"],
      [3, "max"],
      [3, "union"],
    ]);
  });

  it("reports the location and the literal, and the message states the law and the fix", () => {
    const [violation] = scan("src/lib/unrelated.ts", `\n\n  const bank = "visaCal";`);
    expect(violation).toEqual({
      path: "src/lib/unrelated.ts",
      line: 3,
      column: 16,
      literal: "visaCal",
    });
    const message = describeViolations([violation]);
    expect(message).toContain('src/lib/unrelated.ts:3:16  "visaCal"');
    expect(message).toContain("ADR-0013 law 1");
    expect(message).toContain("@/lib/bank-registry");
    expect(message).toContain("`kind`");
  });

  it("passes ordinary uses of the same words", () => {
    const found = scan(
      "src/lib/unrelated.tsx",
      [
        `const biggest = Math.max(1, 2);`,
        `const schema = z.number().max(5);`,
        `const company = CompanyTypes.discount;`,
        `const range = { min: 1, max: 2 };`,
        `type Range = { min: number; max: number };`,
        `const { max } = range; const shorthand = { max };`,
        `export const E = () => <input max={3} className="max-w-sm" />;`,
        `const sentence = "the maximum discount";`,
      ].join("\n"),
    );
    expect(found).toEqual([]);
  });

  it("passes the scraper's company map by its shape, and nothing else in the scraper", () => {
    const map = `const BANK_COMPANY_MAP = { discount: CompanyTypes.discount, max: CompanyTypes.max, visaCal: CompanyTypes.visaCal } as const;`;
    expect(scan("src/lib/scraper/index.ts", map)).toEqual([]);
    expect(scan("src/lib/scraper/index.ts", `${map}\nconst bank = "max";`)).toHaveLength(1);
    expect(scan("src/lib/scraper/other.ts", `const bank = "union";`)).toHaveLength(1);
  });

  it("passes a quoted-key company map, and does not let it excuse an unsanctioned sibling", () => {
    const quoted = `const MAP = { "discount": CompanyTypes.discount, "max": CompanyTypes.max };`;
    expect(scan("src/lib/scraper/index.ts", quoted)).toEqual([]);
    const sibling = `const MAP = { discount: CompanyTypes.discount, max: CompanyTypes.max, union: 1 };`;
    expect(scan("src/lib/scraper/index.ts", sibling).map((f) => f.literal)).toEqual(["union"]);
  });

  it("does not excuse a map whose keys and values disagree", () => {
    const found = scan(
      "src/lib/scraper/index.ts",
      `const MAP = { discount: CompanyTypes.max, max: CompanyTypes.discount };`,
    );
    expect(found.map((f) => f.literal)).toEqual(["discount", "max"]);
  });
});

describe("the guard's exemptions", () => {
  const planted = `const bank = "visaCal";`;

  it.each([
    ["the registry module", "src/lib/bank-registry/entries.ts"],
    ["a file inside the registry's tests", "src/lib/bank-registry/__tests__/entries.test.ts"],
    ["a test directory", "src/components/__tests__/helper.tsx"],
    ["a test file", "src/lib/sync/runs.test.ts"],
    ["a fixtures directory", "src/lib/sync/fixtures/accounts.ts"],
  ])("exempts %s", (_label, sourcePath) => {
    expect(scan(sourcePath, planted)).toEqual([]);
  });

  it.each([
    ["a component", "src/components/credentials-section.tsx"],
    ["a route", "src/app/api/sync/route.ts"],
    ["a maintenance script", "scripts/redetect.ts"],
    ["a sibling directory that merely resembles the registry", "src/lib/bank-registry-extras/x.ts"],
  ])("does not exempt %s", (_label, sourcePath) => {
    expect(scan(sourcePath, planted)).toHaveLength(1);
  });
});
