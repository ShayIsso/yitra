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
 * SQL never enters the scan.
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
 * JSX text. Identifiers in expressions are bindings or members, never literals.
 * Identifier keys are handled separately by `institutionKeyedTable`.
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

interface InstitutionKey {
  readonly at: ts.Node;
  readonly id: string;
  readonly sanctioned: boolean;
}

/**
 * An identifier key is also ordinary vocabulary — `{ min, max }` is a range, and
 * `max` is an institution id — so one such key alone proves nothing. A table keyed
 * by institution (`{ discount: …, max: … }`) is the real leak, and it shows as two
 * or more distinct ids among the keys of one object, type literal, interface or enum.
 * Sanctioned mappings count towards that threshold but are never reported, so
 * they cannot excuse an unsanctioned sibling. Quoted keys are string literals
 * and are always checked.
 */
function institutionKeyedTable(
  node: ts.Node,
  knownLiterals: ReadonlySet<string>,
): InstitutionKey[] {
  let members: readonly ts.Node[];
  if (ts.isObjectLiteralExpression(node)) members = node.properties;
  else if (
    ts.isTypeLiteralNode(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isEnumDeclaration(node)
  ) {
    members = node.members;
  } else return [];

  const keys: InstitutionKey[] = [];
  for (const member of members) {
    if (
      !ts.isPropertyAssignment(member) &&
      !ts.isPropertySignature(member) &&
      !ts.isEnumMember(member)
    ) {
      continue;
    }
    if (!ts.isIdentifier(member.name) || !knownLiterals.has(member.name.text)) continue;
    keys.push({
      at: member.name,
      id: member.name.text,
      sanctioned: ts.isPropertyAssignment(member) && isSanctionedCompanyMapping(member),
    });
  }
  return new Set(keys.map((key) => key.id)).size >= 2 ? keys.filter((key) => !key.sanctioned) : [];
}

function isSanctionedKey(node: ts.Node): boolean {
  const parent = node.parent;
  return (
    ts.isPropertyAssignment(parent) && parent.name === node && isSanctionedCompanyMapping(parent)
  );
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
      /\.tsx$/.test(filePath) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );

    const report = (at: ts.Node, literal: string) => {
      const { line, character } = file.getLineAndCharacterOfPosition(at.getStart(file));
      found.push({ path: filePath, line: line + 1, column: character + 1, literal });
    };

    const visit = (node: ts.Node) => {
      const literal = literalText(node);
      if (literal !== undefined && knownLiterals.has(literal) && !isSanctionedKey(node)) {
        report(node, literal);
      }
      for (const key of institutionKeyedTable(node, knownLiterals)) report(key.at, key.id);
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
