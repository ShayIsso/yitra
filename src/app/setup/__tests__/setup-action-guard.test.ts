import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import ts from "typescript";

/**
 * The middleware exempts `/login` and `/setup` from the auth gate, and Next
 * POSTs a Server Action to the page that rendered it — so every Server Action
 * reachable from those pages' module graphs runs with no session check unless
 * it performs one itself. This walks those graphs from source and fails if any
 * reachable Server Action does not begin with `await requireSession()`. Being
 * the first statement also keeps it out of any `try`, whose `catch` would
 * swallow the redirect it throws and let the action carry on unauthenticated.
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

type ServerAction = { id: string; guarded: boolean };

type FunctionLike = ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression;

function isFunctionLike(node: ts.Node | undefined): node is FunctionLike {
  return (
    !!node &&
    (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node))
  );
}

function bodyStatements(fn: FunctionLike): readonly ts.Statement[] {
  return fn.body && ts.isBlock(fn.body) ? fn.body.statements : [];
}

function hasExportModifier(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    !!ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  );
}

/**
 * The local names that really are `requireSession` from `@/lib/auth`. A local
 * function, variable or parameter of the same name anywhere in the file voids
 * the binding — otherwise a stub named `requireSession` would satisfy the guard.
 */
function trustedGuardNames(source: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== "@/lib/auth" ||
      statement.importClause?.isTypeOnly
    ) {
      continue;
    }
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      const imported = (element.propertyName ?? element.name).text;
      if (imported === "requireSession" && !element.isTypeOnly) names.add(element.name.text);
    }
  }

  const visit = (node: ts.Node) => {
    const declared =
      ts.isFunctionDeclaration(node) ||
      ts.isVariableDeclaration(node) ||
      ts.isParameter(node) ||
      ts.isBindingElement(node) ||
      ts.isClassDeclaration(node);
    if (declared && node.name && ts.isIdentifier(node.name)) names.delete(node.name.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return names;
}

function isGuarded(fn: FunctionLike, guards: Set<string>, skipDirective: boolean): boolean {
  const statement = bodyStatements(fn)[skipDirective ? 1 : 0];
  if (!statement || !ts.isExpressionStatement(statement)) return false;
  const expr = statement.expression;
  return (
    ts.isAwaitExpression(expr) &&
    ts.isCallExpression(expr.expression) &&
    ts.isIdentifier(expr.expression.expression) &&
    guards.has(expr.expression.expression.text)
  );
}

/** Top-level functions by name, for resolving `export { f }` and `export default f`. */
function localFunctions(source: ts.SourceFile): Map<string, FunctionLike> {
  const found = new Map<string, FunctionLike>();
  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      found.set(statement.name.text, statement);
    } else if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && isFunctionLike(decl.initializer)) {
          found.set(decl.name.text, decl.initializer);
        }
      }
    }
  }
  return found;
}

function inlineName(fn: FunctionLike, source: ts.SourceFile): string {
  if (ts.isFunctionDeclaration(fn) && fn.name) return fn.name.text;
  if (ts.isVariableDeclaration(fn.parent) && ts.isIdentifier(fn.parent.name)) {
    return fn.parent.name.text;
  }
  const { line } = source.getLineAndCharacterOfPosition(fn.getStart(source));
  return `<inline:${line + 1}>`;
}

/**
 * File-level `"use server"` makes every export an action: an export is guarded
 * only if it is a function declared in this file whose first statement is the
 * trusted call. Anything else exported from such a file — a wrapped function
 * (`wrap(async () => …)`), a re-export, `export *` — cannot be shown guarded
 * and counts as unguarded. A function-level directive makes that one function
 * an action, named or anonymous.
 */
function serverActions(file: string, source: ts.SourceFile): ServerAction[] {
  const rel = path.relative(SRC, file);
  const guards = trustedGuardNames(source);
  const locals = localFunctions(source);
  const actions: ServerAction[] = [];
  const counted = new Set<FunctionLike>();

  const recordFunction = (name: string, fn: FunctionLike) => {
    counted.add(fn);
    const inline = isUseServer(bodyStatements(fn)[0]);
    actions.push({ id: `${rel}#${name}`, guarded: isGuarded(fn, guards, inline) });
  };
  const recordOpaque = (name: string) => actions.push({ id: `${rel}#${name}`, guarded: false });

  if (isUseServer(source.statements[0])) {
    for (const statement of source.statements) {
      if (ts.isFunctionDeclaration(statement) && hasExportModifier(statement)) {
        recordFunction(statement.name?.text ?? "default", statement);
      } else if (ts.isVariableStatement(statement) && hasExportModifier(statement)) {
        for (const decl of statement.declarationList.declarations) {
          const name = decl.name.getText(source);
          if (isFunctionLike(decl.initializer)) recordFunction(name, decl.initializer);
          else recordOpaque(name);
        }
      } else if (ts.isExportDeclaration(statement) && !statement.isTypeOnly) {
        const clause = statement.exportClause;
        if (!clause || !ts.isNamedExports(clause)) {
          recordOpaque(`*:${statement.moduleSpecifier?.getText(source) ?? ""}`);
          continue;
        }
        for (const element of clause.elements) {
          if (element.isTypeOnly) continue;
          const local = (element.propertyName ?? element.name).text;
          const fn = statement.moduleSpecifier ? undefined : locals.get(local);
          if (fn) recordFunction(element.name.text, fn);
          else recordOpaque(element.name.text);
        }
      } else if (ts.isExportAssignment(statement)) {
        const target = statement.expression;
        const fn = isFunctionLike(target)
          ? target
          : ts.isIdentifier(target)
            ? locals.get(target.text)
            : undefined;
        if (fn) recordFunction("default", fn);
        else recordOpaque("default");
      }
    }
  }

  const visit = (node: ts.Node) => {
    if (isFunctionLike(node) && !counted.has(node) && isUseServer(bodyStatements(node)[0])) {
      recordFunction(inlineName(node, source), node);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return actions;
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
        "app/setup/provider-actions.ts#getProviderSettingsAction",
        "app/setup/provider-actions.ts#saveProviderSettingsAction",
        "app/setup/provider-actions.ts#clearProviderKeyAction",
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

function analyse(code: string, name = "synthetic.tsx"): ServerAction[] {
  const file = path.join(SRC, "app/setup", name);
  return serverActions(file, ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true));
}

const id = (name: string, file = "synthetic.tsx") => `app/setup/${file}#${name}`;

describe("the guard walk itself", () => {
  it("flags an unguarded Settings action if a setup step were to import it", () => {
    const file = path.join(SRC, "app/actions/credentials.ts");
    const found = serverActions(file, parse(file));
    expect(found.find((a) => a.id.endsWith("#addCredentialAction"))?.guarded).toBe(false);
  });

  it("finds actions declared inline in a server component, and a guard swallowed by try", () => {
    const actions = analyse(`
      import { requireSession } from "@/lib/auth";
      export default function Page() {
        async function save() { "use server"; await doWrite(); }
        async function guardedSave() { "use server"; await requireSession("/setup"); await doWrite(); }
        async function swallowedSave() {
          "use server";
          try { await requireSession(); } catch {}
          await doWrite();
        }
        return null;
      }`);

    expect(actions).toEqual([
      { id: id("save"), guarded: false },
      { id: id("guardedSave"), guarded: true },
      { id: id("swallowedSave"), guarded: false },
    ]);
  });

  it("flags an anonymous inline action passed as a prop", () => {
    const actions = analyse(`
      export default function Page() {
        return <form action={async () => { "use server"; await doWrite(); }} />;
      }`);
    expect(actions).toEqual([{ id: id("<inline:3>"), guarded: false }]);
  });

  it("flags an export of a 'use server' file built by a call, which cannot be shown guarded", () => {
    const actions = analyse(
      `"use server";
      import { requireSession } from "@/lib/auth";
      export const wrappedAction = wrap(async () => { await requireSession(); await doWrite(); });`,
      "wrapped.ts",
    );
    expect(actions).toEqual([{ id: id("wrappedAction", "wrapped.ts"), guarded: false }]);
  });

  it("flags re-exports and export-star from a 'use server' file", () => {
    const actions = analyse(
      `"use server";
      export { addCredentialAction as finishAction } from "@/app/actions/credentials";
      export * from "@/app/actions/rules";`,
      "reexport.ts",
    );
    expect(actions.map((a) => a.guarded)).toEqual([false, false]);
    expect(actions[0].id).toBe(id("finishAction", "reexport.ts"));
  });

  it("resolves a local re-export to the function it names", () => {
    const actions = analyse(
      `"use server";
      import { requireSession } from "@/lib/auth";
      async function guarded() { await requireSession(); }
      async function open() { await doWrite(); }
      export { guarded as finishAction, open };`,
      "local-export.ts",
    );
    expect(actions).toEqual([
      { id: id("finishAction", "local-export.ts"), guarded: true },
      { id: id("open", "local-export.ts"), guarded: false },
    ]);
  });

  it("does not accept a local function named requireSession in place of the real one", () => {
    const actions = analyse(
      `"use server";
      import { requireSession } from "@/lib/auth";
      async function requireSession() {}
      export async function finishAction() { await requireSession(); await doWrite(); }`,
      "shadowed.ts",
    );
    expect(actions).toEqual([{ id: id("finishAction", "shadowed.ts"), guarded: false }]);
  });

  it("does not accept a requireSession imported from anywhere but @/lib/auth", () => {
    const actions = analyse(
      `"use server";
      import { requireSession } from "./my-auth";
      export async function finishAction() { await requireSession(); await doWrite(); }`,
      "foreign-guard.ts",
    );
    expect(actions[0].guarded).toBe(false);
  });

  it("accepts the real guard under an alias", () => {
    const actions = analyse(
      `"use server";
      import { requireSession as mustBeSignedIn } from "@/lib/auth";
      export async function finishAction() { await mustBeSignedIn("/setup"); await doWrite(); }`,
      "aliased.ts",
    );
    expect(actions[0].guarded).toBe(true);
  });
});
