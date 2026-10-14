import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";

/**
 * The tier is presentational only, never a second code path (ADR-0013 §3): an
 * experimental institution is scraped, imported and categorized exactly as a
 * verified one. Trust is therefore read by components alone; no domain module,
 * route or Server Action may reach for it. Merchant memory has an unrelated
 * `tier` of its own, so the patterns name the registry's trust API rather than
 * the bare word.
 */
const SRC = path.resolve(__dirname, "../../..");
const GUARDED_ROOTS = ["lib", "app/api", "app/actions"];
const OWN_MODULE = path.join(SRC, "lib/bank-registry");
const TRUST_READS = [
  /\bresolveBankTrust\b/,
  /\bbankTrustOf\b/,
  /\bBankTrust\b/,
  /\bBankTier\b/,
  /\bentry\??\.tier\b/,
  /findBankEntry\([^)]*\)\??\.tier\b/,
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      return name === "__tests__" || full === OWN_MODULE ? [] : sourceFiles(full);
    }
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

const files = GUARDED_ROOTS.flatMap((root) => sourceFiles(path.join(SRC, root)));

describe("institution trust stays out of every code path", () => {
  it("scans the scraper, import, categorization and sync modules", () => {
    const scanned = files.map((file) => path.relative(SRC, file));
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

  it("is read by no domain module, route or Server Action", () => {
    const readers = files.filter((file) => {
      const source = readFileSync(file, "utf8");
      return TRUST_READS.some((pattern) => pattern.test(source));
    });
    expect(readers.map((file) => path.relative(SRC, file))).toEqual([]);
  });
});
