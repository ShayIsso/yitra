import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { existsSync, readFileSync, statSync } from "fs";
import path from "path";
import type { BankType } from "@/lib/bank-registry";
import {
  InstitutionPicker,
  bankPickerOptions,
  isInstitutionCleared,
  observedFromResponse,
  useInstitutionPicker,
} from "@/components/institution-picker";

const ACKNOWLEDGMENT_PROMPT = "הבנתי, להמשיך עם מוסד ניסיוני";

function renderPicker(value: BankType, observed?: readonly string[]) {
  function Harness() {
    const picker = useInstitutionPicker(observed ? { observed } : {});
    return createElement(InstitutionPicker, { picker, value, onValueChange: () => undefined });
  }
  return renderToStaticMarkup(createElement(Harness));
}

describe("the institution picker's acknowledgment", () => {
  it("asks for one when an experimental institution is selected and this install has no evidence", () => {
    const html = renderPicker("isracard");
    expect(html).toContain(ACKNOWLEDGMENT_PROMPT);
    expect(html).toContain("ניסיוני");
  });

  it("asks for none when a verified institution is selected", () => {
    expect(renderPicker("discount")).not.toContain(ACKNOWLEDGMENT_PROMPT);
  });

  it("asks for none once this install has synced the institution, and says so", () => {
    const html = renderPicker("isracard", ["isracard"]);
    expect(html).not.toContain(ACKNOWLEDGMENT_PROMPT);
    expect(html).toContain("סונכרן כאן");
  });

  it("keeps asking when the evidence names a different institution", () => {
    expect(renderPicker("isracard", ["amex"])).toContain(ACKNOWLEDGMENT_PROMPT);
  });
});

describe("isInstitutionCleared", () => {
  it("holds back an experimental institution until it is acknowledged", () => {
    expect(isInstitutionCleared("experimental", "isracard", null)).toBe(false);
    expect(isInstitutionCleared("experimental", "isracard", "isracard")).toBe(true);
  });

  it("does not carry an acknowledgment over to another institution", () => {
    expect(isInstitutionCleared("experimental", "amex", "isracard")).toBe(false);
  });

  it("lets verified and observed institutions through without one", () => {
    expect(isInstitutionCleared("verified", "discount", null)).toBe(true);
    expect(isInstitutionCleared("observed", "isracard", null)).toBe(true);
  });
});

describe("observedFromResponse", () => {
  it("reads the institution ids of a well-formed evidence body", () => {
    expect(observedFromResponse({ observed: ["isracard", "leumi"] })).toEqual(
      new Set(["isracard", "leumi"]),
    );
  });

  it("reads anything else as no evidence, so the caveat keeps showing", () => {
    for (const body of [null, undefined, "isracard", {}, { observed: "isracard" }]) {
      expect(observedFromResponse(body)).toEqual(new Set());
    }
  });

  it("drops entries that are not ids", () => {
    expect(observedFromResponse({ observed: ["isracard", 7, null] })).toEqual(
      new Set(["isracard"]),
    );
  });
});

describe("bankPickerOptions", () => {
  it("never offers the institution excluded from both tiers", () => {
    expect(bankPickerOptions().map((option) => option.value)).not.toContain("oneZero");
  });
});

/**
 * The wizard renders this picker from `/setup`, which the middleware exempts
 * from the auth gate, so a Server Action anywhere in its module graph would be
 * callable by anyone who can reach the port.
 */
describe("the institution picker's module graph", () => {
  const SRC = path.resolve(__dirname, "../..");
  const IMPORT =
    /(?:import|export)[^"']*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;

  function resolve(fromFile: string, specifier: string): string | null {
    const base = specifier.startsWith("@/")
      ? path.join(SRC, specifier.slice(2))
      : specifier.startsWith(".")
        ? path.resolve(path.dirname(fromFile), specifier)
        : null;
    if (!base) return null;
    for (const ext of ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]) {
      const candidate = base + ext;
      if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    }
    return null;
  }

  it("reaches no Server Action module", () => {
    const queue = [path.join(SRC, "components/institution-picker.tsx")];
    const seen = new Set<string>();
    const serverModules: string[] = [];
    while (queue.length > 0) {
      const file = queue.shift()!;
      if (seen.has(file)) continue;
      seen.add(file);
      const source = readFileSync(file, "utf8");
      if (/^\s*["']use server["']/m.test(source)) serverModules.push(path.relative(SRC, file));
      for (const match of source.matchAll(IMPORT)) {
        const next = resolve(file, match[1] ?? match[2]);
        if (next) queue.push(next);
      }
    }
    expect(seen.size).toBeGreaterThan(3);
    expect(serverModules).toEqual([]);
  });
});
