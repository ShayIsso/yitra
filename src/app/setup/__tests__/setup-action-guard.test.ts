import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import ts from "typescript";

/**
 * The middleware exempts `/login` and `/setup` from the auth gate, and Next
 * POSTs a Server Action to the page that rendered it — so every Server Action
 * reachable from those pages' module graphs runs with no session check unless
 * it performs one itself. This walks those graphs from source and fails if any
 * reachable Server Action does not begin with `await requireSession()`.
 *
 * It exists for the wizard's later steps (#259–#262): importing an existing
 * Settings action (e.g. adding a credential) into a step would silently publish
 * it to anyone who can reach the port. Wrap the library call in a setup-local
 * action that calls `requireSession()` first instead.
 */
const SRC = path.resolve(__dirname, "../../..");
const EXEMPT_ROUTE_DIRS = ["app/setup", "app/login"];
const ROOT_LAYOUT = "app/layout.tsx";

/** Runs before any session can exist; guarded by its conditional write (ADR-0014 §4). */
const UNAUTHENTICATED_BY_DESIGN = new Set(["app/setup/actions.ts#setInitialPasswordAction"]);

const ROUTE_FILE = /^(page|layout|template|loading|error|not-found|default)\.tsx?$/;
const EXTENSIONS = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

function routeEntries(dir: string): string[] {
  const abs = path.join(SRC, dir);
  return readdirSync(abs).flatMap((name) => {
    const full = path.join(abs, name);
    if (statSync(full).isDirectory()) {
      return name === "__tests__" ? [] : routeEntries(path.join(dir, name));
    }
    return ROUTE_FILE.test(name) ? [full] : [];
  });
}

function resolveImport(fromFile: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = path.join(SRC, specifier.slice(2));
  else if (specifier.startsWith(".")) base = path.resolve(path.dirname(fromFile), specifier);
  else return null;

  for (const ext of EXTENSIONS) {
    const candidate = base + ext;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function importSpecifiers(source: ts.SourceFile): string[] {
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      found.push(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      found.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
}

function reachableFiles(entries: string[]): Map<string, ts.SourceFile> {
  const seen = new Map<string, ts.SourceFile>();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    const source = parse(file);
    seen.set(file, source);
    for (const specifier of importSpecifiers(source)) {
      const resolved = resolveImport(file, specifier);
      if (resolved && !seen.has(resolved)) queue.push(resolved);
    }
  }
  return seen;
}

function isUseServer(statement: ts.Statement | undefined): boolean {
  return (
    statement !== undefined &&
    ts.isExpressionStatement(statement) &&
    ts.isStringLiteral(statement.expression) &&
    statement.expression.text === "use server"
  );
}

function isAwaitRequireSession(statement: ts.Statement | undefined): boolean {
  if (!statement || !ts.isExpressionStatement(statement)) return false;
  const expr = statement.expression;
  return (
    ts.isAwaitExpression(expr) &&
    ts.isCallExpression(expr.expression) &&
    ts.isIdentifier(expr.expression.expression) &&
    expr.expression.expression.text === "requireSession"
  );
}

type ServerAction = { id: string; guarded: boolean };

type FunctionLike = ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression;

function bodyStatements(fn: FunctionLike): readonly ts.Statement[] {
  return fn.body && ts.isBlock(fn.body) ? fn.body.statements : [];
}

/**
 * File-level `"use server"` makes every export an action; a function-level
 * directive makes that one function an action. Both are collected.
 */
function isExported(node: ts.FunctionDeclaration | ts.VariableStatement): boolean {
  return !!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

function namedFunctions(
  source: ts.SourceFile,
): { name: string; fn: FunctionLike; exported: boolean }[] {
  const found: { name: string; fn: FunctionLike; exported: boolean }[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.body) {
      const exported = node.parent === source && isExported(node);
      found.push({ name: node.name?.text ?? "<anonymous>", fn: node, exported });
    } else if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      const statement = node.parent.parent;
      const exported =
        ts.isVariableStatement(statement) && statement.parent === source && isExported(statement);
      found.push({ name: node.name.getText(source), fn: node.initializer, exported });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function serverActions(file: string, source: ts.SourceFile): ServerAction[] {
  const rel = path.relative(SRC, file);
  const fileLevel = isUseServer(source.statements[0]);

  return namedFunctions(source).flatMap(({ name, fn, exported }) => {
    const statements = bodyStatements(fn);
    const inline = isUseServer(statements[0]);
    if (!inline && !(fileLevel && exported)) return [];
    return [{ id: `${rel}#${name}`, guarded: isAwaitRequireSession(statements[inline ? 1 : 0]) }];
  });
}

function actionsReachableFromExemptRoutes(): ServerAction[] {
  const entries = [...EXEMPT_ROUTE_DIRS.flatMap(routeEntries), path.join(SRC, ROOT_LAYOUT)];
  const files = reachableFiles(entries);
  return [...files].flatMap(([file, source]) => serverActions(file, source));
}

describe("Server Actions reachable from auth-exempt routes", () => {
  const actions = actionsReachableFromExemptRoutes();

  it("finds the setup wizard's actions, so the walk is actually reaching them", () => {
    expect(actions.map((a) => a.id)).toEqual(
      expect.arrayContaining([
        "app/setup/actions.ts#setInitialPasswordAction",
        "app/setup/actions.ts#completeOnboardingAction",
      ]),
    );
  });

  it("each begin with `await requireSession()`, except the first-password claim", () => {
    const unguarded = actions
      .filter((a) => !a.guarded && !UNAUTHENTICATED_BY_DESIGN.has(a.id))
      .map((a) => a.id);
    expect(unguarded).toEqual([]);
  });
});

describe("the guard walk itself", () => {
  it("flags an unguarded Settings action if a setup step were to import it", () => {
    const file = path.join(SRC, "app/actions/credentials.ts");
    const found = serverActions(file, parse(file));
    expect(found.find((a) => a.id.endsWith("#addCredentialAction"))?.guarded).toBe(false);
  });

  it("finds an action declared inline in a server component", () => {
    const code = `
      export default function Page() {
        async function save() { "use server"; await doWrite(); }
        async function guardedSave() { "use server"; await requireSession(); await doWrite(); }
        return null;
      }`;
    const file = path.join(SRC, "app/setup/synthetic.tsx");
    const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true);

    expect(serverActions(file, source)).toEqual([
      { id: "app/setup/synthetic.tsx#save", guarded: false },
      { id: "app/setup/synthetic.tsx#guardedSave", guarded: true },
    ]);
  });
});
