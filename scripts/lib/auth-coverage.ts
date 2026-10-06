/**
 * The auth-coverage rule: every function that can serve
 * warehouse data to a request must call requireViewer() itself.
 *
 *   - each exported async function in src/features/<view>/bigquery.ts and
 *     queries.ts (a warehouse read is always async; pure helpers are not)
 *   - each exported HTTP handler in a route.ts under src/app
 *   - each server action ("use server" files, or functions with that directive)
 *
 * And requireViewer() stays the only way to reach the warehouse: no other file
 * in src imports a value from the modules that build warehouse access.
 *
 * PUBLIC_ROUTES lists the handlers that are public by design, each with why.
 */
import { posix } from "node:path";
import ts from "typescript";

export const PUBLIC_ROUTES: Record<string, string> = {
  "src/app/healthz/route.ts": "liveness only; returns the build id and reads no data",
};

const WAREHOUSE_MODULES = new Set([
  "src/lib/data/warehouse.server.ts",
  "src/lib/data/bigquery-rest.server.ts",
  "src/lib/data/google-token.server.ts",
]);
const WAREHOUSE_IMPORTERS = new Set(["src/lib/auth/require-viewer.ts", "src/lib/data/warehouse.server.ts"]);

const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

export type SourceFile = { path: string; text: string };

/** A guard must be the first executable statement, awaited directly and imported
 * from the canonical module. TypeScript resolves its binding, so a parameter or
 * local function with the same name cannot count as authentication. */
function startsWithGuard(fn: ts.FunctionLikeDeclaration, checker: ts.TypeChecker): boolean {
  if (fn.asteriskToken || !fn.body || !ts.isBlock(fn.body) || fn.parameters.some((parameter) => parameter.initializer))
    return false;
  const statement = fn.body.statements.find(
    (item) => !(ts.isExpressionStatement(item) && ts.isStringLiteral(item.expression)),
  );
  let expression: ts.Expression | undefined;
  if (statement && ts.isExpressionStatement(statement)) expression = statement.expression;
  if (statement && ts.isVariableStatement(statement) && statement.declarationList.declarations.length === 1)
    expression = statement.declarationList.declarations[0]?.initializer;
  if (!expression || !ts.isAwaitExpression(expression) || !ts.isCallExpression(expression.expression)) return false;
  const call = expression.expression;
  if (!ts.isIdentifier(call.expression)) return false;
  // The guard's arguments must not do work before authentication either.
  if (call.arguments.length > 1) return false;
  const argument = call.arguments[0];
  if (
    argument &&
    (!ts.isObjectLiteralExpression(argument) ||
      argument.properties.some(
        (property) =>
          !ts.isPropertyAssignment(property) ||
          property.name.getText() !== "live" ||
          property.initializer.kind !== ts.SyntaxKind.TrueKeyword,
      ))
  )
    return false;
  const binding = checker.getSymbolAtLocation(call.expression)?.declarations?.[0];
  if (
    !binding ||
    !ts.isImportSpecifier(binding) ||
    binding.isTypeOnly ||
    (binding.propertyName ?? binding.name).text !== "requireViewer"
  )
    return false;
  const clause = binding.parent.parent;
  const declaration = clause.parent;
  if (clause.isTypeOnly || !ts.isImportDeclaration(declaration) || !ts.isStringLiteral(declaration.moduleSpecifier))
    return false;
  return (
    modulePath(declaration.moduleSpecifier.text, declaration.getSourceFile().fileName) === "src/lib/auth/require-viewer"
  );
}

function hasDirective(statements: readonly ts.Statement[], directive: string): boolean {
  for (const statement of statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) return false;
    if (statement.expression.text === directive) return true;
  }
  return false;
}

function hasUseServer(body: ts.Node | undefined): boolean {
  return Boolean(body && ts.isBlock(body) && hasDirective(body.statements, "use server"));
}

function modulePath(specifier: string, from: string): string | null {
  const path = specifier.startsWith("@/")
    ? `src/${specifier.slice(2)}`
    : specifier.startsWith(".")
      ? posix.normalize(posix.join(posix.dirname(from), specifier))
      : null;
  return path?.replace(/\.tsx?$/, "") ?? null;
}

function resolveModule(specifier: string, from: string, files: Map<string, SourceFile>): string | null {
  const base = modulePath(specifier, from);
  if (!base) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (files.has(candidate)) return candidate;
  }
  return null;
}

/** A small in-memory program uses TS's binding and re-export resolution, without
 * loading dependencies or executing customer code. Unknown forms fail closed. */
function sourceProgram(files: Map<string, SourceFile>): ts.Program {
  const source = new Map(
    [...files].map(([path, file]) => [
      path,
      ts.createSourceFile(
        path,
        file.text,
        ts.ScriptTarget.Latest,
        true,
        path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
      ),
    ]),
  );
  return ts.createProgram(
    [...files.keys()],
    { noLib: true, noResolve: false },
    {
      getSourceFile: (path) => source.get(path),
      getDefaultLibFileName: () => "",
      writeFile: () => undefined,
      getCurrentDirectory: () => "",
      getDirectories: () => [],
      fileExists: (path) => files.has(path),
      readFile: (path) => files.get(path)?.text,
      getCanonicalFileName: (path) => path,
      useCaseSensitiveFileNames: () => true,
      getNewLine: () => "\n",
      resolveModuleNames: (names, from) =>
        names.map((name) => {
          const resolvedFileName = resolveModule(name, from, files);
          return resolvedFileName ? { resolvedFileName } : undefined;
        }),
    },
  );
}

function functionFor(
  symbol: ts.Symbol,
  checker: ts.TypeChecker,
  seen = new Set<ts.Symbol>(),
): ts.FunctionLikeDeclaration | null {
  if (seen.has(symbol)) return null;
  seen.add(symbol);
  if (symbol.flags & ts.SymbolFlags.Alias) return functionFor(checker.getAliasedSymbol(symbol), checker, seen);
  const declaration = symbol.valueDeclaration;
  if (!declaration) return null;
  if (ts.isFunctionDeclaration(declaration)) return declaration;
  let expression = ts.isVariableDeclaration(declaration)
    ? declaration.initializer
    : ts.isExportAssignment(declaration)
      ? declaration.expression
      : undefined;
  if (expression && ts.isIdentifier(expression)) {
    const target = checker.getSymbolAtLocation(expression);
    return target ? functionFor(target, checker, seen) : null;
  }
  if (expression && ts.isCallExpression(expression) && ts.isIdentifier(expression.expression)) {
    const binding = checker.getSymbolAtLocation(expression.expression)?.declarations?.[0];
    if (!binding || !ts.isImportSpecifier(binding) || (binding.propertyName ?? binding.name).text !== "cache")
      return null;
    const origin = binding.parent.parent.parent;
    if (
      !ts.isImportDeclaration(origin) ||
      !ts.isStringLiteral(origin.moduleSpecifier) ||
      origin.moduleSpecifier.text !== "react"
    )
      return null;
    expression = expression.arguments.length === 1 ? expression.arguments[0] : undefined;
  }
  return expression && (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) ? expression : null;
}

/** The warehouse modules this file imports a value (not only types) from, directly or by re-export. */
function warehouseImports(source: ts.SourceFile, path: string, files: Map<string, SourceFile>): string[] {
  const found: string[] = [];
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) continue;
    const specifier = statement.moduleSpecifier;
    const target = specifier && ts.isStringLiteral(specifier) ? resolveModule(specifier.text, path, files) : null;
    if (!target || !WAREHOUSE_MODULES.has(target)) continue;
    if (ts.isExportDeclaration(statement)) {
      if (!statement.isTypeOnly) found.push(target);
      continue;
    }
    const clause = statement.importClause;
    if (clause?.isTypeOnly) continue;
    if (!clause) {
      found.push(target);
      continue;
    }
    const bindings = clause.namedBindings;
    const typesOnly =
      !clause.name && bindings && ts.isNamedImports(bindings) && bindings.elements.every((e) => e.isTypeOnly);
    if (!typesOnly) found.push(target);
  }
  // `await import(...)` loads the module too; `typeof import(...)` is a type and is not a call.
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [argument] = node.arguments;
      const target = argument && ts.isStringLiteralLike(argument) ? resolveModule(argument.text, path, files) : null;
      if (target && WAREHOUSE_MODULES.has(target)) found.push(target);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** Exported filter maps and limits are data, not loaders. */
function isConstant(node: ts.Node | undefined): boolean {
  if (!node) return false;
  if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) return isConstant(node.expression);
  if (
    ts.isStringLiteralLike(node) ||
    ts.isNumericLiteral(node) ||
    [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(node.kind)
  )
    return true;
  if (ts.isArrayLiteralExpression(node)) return node.elements.every(isConstant);
  if (ts.isObjectLiteralExpression(node))
    return node.properties.every(
      (property) =>
        ts.isPropertyAssignment(property) &&
        !ts.isComputedPropertyName(property.name) &&
        isConstant(property.initializer),
    );
  return false;
}

/** One sentence per gap: the file, the function, and the fix. This is a coding
 * guardrail, not a sandbox for malicious source changes or a runtime guard. */
export function findAuthGaps(files: SourceFile[]): string[] {
  const byPath = new Map(files.map((file) => [file.path, file]));
  const program = sourceProgram(byPath);
  const checker = program.getTypeChecker();
  const gaps: string[] = [];
  const checkedFunctions = new Set<ts.FunctionLikeDeclaration>();
  for (const file of files) {
    if (!/\.tsx?$/.test(file.path)) {
      gaps.push(
        `\`${file.path}\` is outside the checked TypeScript source format; use .ts or .tsx under src so types and auth coverage apply.`,
      );
      continue;
    }
    const source = program.getSourceFile(file.path);
    if (!source) throw new Error(`Auth check could not parse ${file.path}`);
    if (!WAREHOUSE_IMPORTERS.has(file.path)) {
      for (const target of warehouseImports(source, file.path, byPath)) {
        gaps.push(
          `\`${file.path}\` imports \`${target}\`, which reaches the warehouse without \`requireViewer()\`; take the warehouse from \`await requireViewer({ live: true })\` in a feature's bigquery.ts instead.`,
        );
      }
    }
    const visitImports = (node: ts.Node) => {
      const computedImport =
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        (!node.arguments[0] || !ts.isStringLiteralLike(node.arguments[0]));
      const requireReference = ts.isIdentifier(node) && ["require", "createRequire"].includes(node.text);
      const commonJs = ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference);
      if (computedImport || requireReference || commonJs) {
        gaps.push(
          `\`${file.path}\` uses a module-loading form the auth check cannot follow; use a static ES import or a literal import() so warehouse access can be checked.`,
        );
      }
      ts.forEachChild(node, visitImports);
    };
    visitImports(source);
    if (PUBLIC_ROUTES[file.path]) continue;
    const isLoader = /^src\/features\/[^/]+\/(bigquery|queries)\.ts$/.test(file.path);
    const isRoute = /^src\/app\/(.*\/)?route\.tsx?$/.test(file.path);
    const isActionFile = hasDirective(source.statements, "use server");
    if (isRoute || isLoader || isActionFile) {
      // Reject unresolved export-stars as well as unresolved named exports.
      for (const statement of source.statements) {
        if (
          ts.isExportDeclaration(statement) &&
          !statement.isTypeOnly &&
          !statement.exportClause &&
          statement.moduleSpecifier &&
          ts.isStringLiteral(statement.moduleSpecifier) &&
          !resolveModule(statement.moduleSpecifier.text, file.path, byPath)
        ) {
          gaps.push(
            `\`${file.path}\` re-exports an unknown module; export guarded functions from a file in this repository.`,
          );
        }
      }
      const symbol = checker.getSymbolAtLocation(source);
      for (const exported of symbol ? checker.getExportsOfModule(symbol) : []) {
        const name = exported.name;
        if (isRoute && !HTTP_METHODS.has(name)) continue;
        const target = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
        if (!isRoute && target.flags & ts.SymbolFlags.Type && !(target.flags & ts.SymbolFlags.Value)) continue;
        const fn = functionFor(exported, checker);
        if (
          isLoader &&
          target.valueDeclaration &&
          ts.isVariableDeclaration(target.valueDeclaration) &&
          isConstant(target.valueDeclaration.initializer)
        )
          continue;
        if (isLoader && fn && !fn.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword)) continue;
        if (fn) checkedFunctions.add(fn);
        if (fn && startsWithGuard(fn, checker)) continue;
        if (!fn) {
          gaps.push(
            `\`${file.path}\` exports \`${name}\` in a form the auth check cannot follow; define it as a function in this repository that calls \`await requireViewer()\` first.`,
          );
        } else {
          const what = isRoute ? "handles requests" : isLoader ? "reads data" : "is a server action";
          gaps.push(
            `\`${file.path}\` exports \`${name}\`, which ${what} without calling \`requireViewer()\`; call \`await requireViewer()\` first.`,
          );
        }
      }
    }
    // Inline actions may be nested in components; each needs its own guard.
    const visit = (node: ts.Node) => {
      if (
        (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) &&
        hasUseServer(node.body) &&
        !startsWithGuard(node, checker) &&
        !checkedFunctions.has(node)
      ) {
        const named = node.name ?? (ts.isVariableDeclaration(node.parent) ? node.parent.name : undefined);
        const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        gaps.push(
          `\`${file.path}:${line}\` defines the server action \`${named && ts.isIdentifier(named) ? named.text : "(inline)"}\`, which runs without calling \`requireViewer()\`; call \`await requireViewer()\` first in it.`,
        );
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return [...new Set(gaps)];
}
