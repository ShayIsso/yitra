import ts from "typescript";

export interface SourceFileInput {
  /** Repo-relative, forward-slash path, e.g. `src/components/foo.tsx`. */
  readonly path: string;
  readonly text: string;
}

export interface InstitutionLiteral {
  readonly path: string;
  readonly line: number;
  readonly column: number;
  readonly literal: string;
}

const SOURCE_EXTENSION = /\.tsx?$/;
const TEST_FILE = /\.test\.tsx?$/;
const EXEMPT_DIRECTORIES = new Set(["__tests__", "__fixtures__", "fixtures"]);
const REGISTRY_DIRECTORY = "src/lib/bank-registry";

/**
 * Exempt by construction: the registry owns institution facts, and tests and
 * fixtures name institutions to assert on them. Only `.ts`/`.tsx` is scanned, so
 * generated migration SQL under `drizzle/` never enters the walk.
 */
export function isScannedSource(relativePath: string): boolean {
  if (!SOURCE_EXTENSION.test(relativePath) || TEST_FILE.test(relativePath)) return false;
  if (relativePath.startsWith(`${REGISTRY_DIRECTORY}/`)) return false;
  return !relativePath.split("/").some((segment) => EXEMPT_DIRECTORIES.has(segment));
}

/**
 * The scraper's company map (ADR-0013 "Inherits") is the one sanctioned site
 * outside the registry. It is recognised by shape — a key naming the very
 * `CompanyTypes` member it maps to — so no other literal in the scraper, or
 * anywhere else, is excused by where it lives.
 */
function isSanctionedCompanyMapping(node: ts.PropertyAssignment): boolean {
  const key = ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : null;
  const value = node.initializer;
  return (
    key !== null &&
    ts.isPropertyAccessExpression(value) &&
    ts.isIdentifier(value.expression) &&
    value.expression.text === "CompanyTypes" &&
    value.name.text === key
  );
}

/**
 * A literal is text the program contains verbatim: a string, template text or
 * JSX text. `Math.max`, `.max(…)`, `CompanyTypes.max` and a shorthand `{ max }`
 * reference a binding or member rather than naming an institution, so they
 * never match. Identifier keys are handled separately by `institutionKeyedTable`.
 */
function literalText(node: ts.Node): string | undefined {
  if (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateHead(node) ||
    ts.isTemplateMiddle(node) ||
    ts.isTemplateTail(node)
  ) {
    return node.text;
  }
  return ts.isJsxText(node) ? node.text.trim() : undefined;
}

type KeyedMember = ts.PropertyAssignment | ts.PropertySignature;

/**
 * An identifier key is also ordinary vocabulary — `{ min, max }` is a range, and
 * `max` is an institution id — so one such key alone proves nothing. A table keyed
 * by institution (`{ discount: …, max: … }`) is the real leak, and it shows as two
 * or more distinct ids among the keys of one object, type literal or interface.
 * Quoted keys are string literals and are always checked.
 */
function institutionKeyedTable(
  node: ts.Node,
  knownLiterals: ReadonlySet<string>,
): KeyedMember[] | undefined {
  let members: readonly ts.Node[];
  if (ts.isObjectLiteralExpression(node)) members = node.properties;
  else if (ts.isTypeLiteralNode(node) || ts.isInterfaceDeclaration(node)) members = node.members;
  else return undefined;

  const keyed = members.filter(
    (member): member is KeyedMember =>
      (ts.isPropertyAssignment(member) &&
        !isSanctionedCompanyMapping(member) &&
        ts.isIdentifier(member.name)) ||
      (ts.isPropertySignature(member) && ts.isIdentifier(member.name)),
  );
  const matching = keyed.filter((member) => knownLiterals.has((member.name as ts.Identifier).text));
  const distinct = new Set(matching.map((member) => (member.name as ts.Identifier).text));
  return distinct.size >= 2 ? matching : undefined;
}

export function findInstitutionLiterals(
  sources: readonly SourceFileInput[],
  knownLiterals: ReadonlySet<string>,
): InstitutionLiteral[] {
  const found: InstitutionLiteral[] = [];

  for (const { path: filePath, text } of sources) {
    if (!isScannedSource(filePath)) continue;
    const file = ts.createSourceFile(
      filePath,
      text,
      ts.ScriptTarget.Latest,
      true,
      filePath.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    const report = (at: ts.Node, literal: string) => {
      const { line, character } = file.getLineAndCharacterOfPosition(at.getStart(file));
      found.push({ path: filePath, line: line + 1, column: character + 1, literal });
    };

    const visit = (node: ts.Node) => {
      const literal = literalText(node);
      if (literal !== undefined && knownLiterals.has(literal)) report(node, literal);
      for (const member of institutionKeyedTable(node, knownLiterals) ?? []) {
        report(member.name, (member.name as ts.Identifier).text);
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return found;
}

export function describeViolations(violations: readonly InstitutionLiteral[]): string {
  const locations = violations
    .map((v) => `  ${v.path}:${v.line}:${v.column}  "${v.literal}"`)
    .join("\n");
  return [
    "An institution id appears outside the bank registry (ADR-0013 law 1: no institution id outside `src/lib/bank-registry`).",
    locations,
    "Read institution facts from `@/lib/bank-registry` instead, and branch on a registry property such as `kind` or `issuesOtp`, never on an id.",
    "Adding an institution is a registry entry plus one `BANK_COMPANY_MAP` line in the scraper, nothing else.",
  ].join("\n");
}
