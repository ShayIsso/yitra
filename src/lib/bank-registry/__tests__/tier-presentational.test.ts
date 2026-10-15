import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";

/**
 * The tier is presentational only, never a second code path (ADR-0013 §3): an
 * experimental institution is scraped, imported and categorized exactly as a
 * verified one. Trust is therefore read by components under `src/components`
 * alone. Every domain module, route handler, Server Action and server page is
 * scanned; a page that needs a badge passes evidence ids down to a component,
 * as `/sync` does, rather than resolving trust itself.
 *
 * Merchant memory has an unrelated tier of its own, written as a `tier:` key and
 * never read as `.tier` or as a quoted tier value of this registry.
 */
const SRC = path.resolve(__dirname, "../../..");
const APP = path.join(SRC, "app");
const OWN_MODULE = path.join(SRC, "lib/bank-registry");
const ROUTE_SEGMENT_FILE = /^(page|layout|template|loading|error|not-found|default)\.tsx$/;
const TRUST_READS = [
  /\bresolveBankTrust\b/,
  /\bbankTrustOf\b/,
  /\bBankTrust\b/,
  /\bBankTier\b/,
  /\.tier\b/,
  /["'`]experimental["'`]/,
  /["'`]verified["'`]/,
];

function readsInstitutionTrust(source: string): boolean {
  return TRUST_READS.some((pattern) => pattern.test(source));
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      return name === "__tests__" || full === OWN_MODULE ? [] : sourceFiles(full);
    }
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

/** Under `app`: route handlers and action modules (`.ts`) plus server route-segment files. */
function isGuarded(file: string): boolean {
  if (!file.startsWith(APP)) return true;
  return file.endsWith(".ts") || ROUTE_SEGMENT_FILE.test(path.basename(file));
}

const files = [...sourceFiles(path.join(SRC, "lib")), ...sourceFiles(APP)].filter(isGuarded);

describe("the trust scanner", () => {
  it("catches a fork on an entry's tier, through any binding name", () => {
    expect(
      readsInstitutionTrust(`
        const institution = findBankEntry(bankType);
        if (institution?.tier === "experimental") return true;
      `),
    ).toBe(true);
  });

  it("catches a fork through the entry list", () => {
    expect(
      readsInstitutionTrust(
        `enabledBankEntries().some((e) => e.id === bankType && e.tier !== "verified")`,
      ),
    ).toBe(true);
  });

  it("does not flag merchant memory's own tier key", () => {
    expect(
      readsInstitutionTrust(
        `recordAssignment({ transactionId, toCategoryId, tier: "user" }, store)`,
      ),
    ).toBe(false);
  });
});

describe("institution trust stays out of every code path", () => {
  it("scans the scraper, import, categorization and sync modules, routes, actions and pages", () => {
    const scanned = files.map((file) => path.relative(SRC, file));
    expect(scanned).toContain("app/setup/actions.ts");
    expect(scanned).toContain("app/api/sync-runs/evidence/route.ts");
    expect(scanned).toContain("app/(dashboard)/sync/page.tsx");
    expect(scanned).toContain("app/setup/page.tsx");
    for (const dir of [
      "lib/scraper/",
      "lib/transactions/",
      "lib/categories/",
      "lib/ai-categorization/",
      "lib/sync/",
    ]) {
      expect(scanned.some((file) => file.startsWith(dir))).toBe(true);
    }
  });

  it("is read by no domain module, route, Server Action or server page", () => {
    const readers = files.filter((file) => readsInstitutionTrust(readFileSync(file, "utf8")));
    expect(readers.map((file) => path.relative(SRC, file))).toEqual([]);
  });
});
