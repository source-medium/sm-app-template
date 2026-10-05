/**
 * The auth-coverage rule: every function that can serve
 * warehouse data to a request must call requireViewer() itself.
 *
 *   - each exported async function in src/features/<view>/bigquery.ts and
 *     queries.ts (a warehouse read is always async; pure helpers are not)
 *   - each exported HTTP handler in a route.ts under src/app
 *   - each server action ("use server" files, or functions with that directive)
 *
 * PUBLIC_ROUTES lists the handlers that are public by design, each with why.
 */
import { posix } from "node:path";
import ts from "typescript";

export const PUBLIC_ROUTES: Record<string, string> = {
  "src/app/healthz/route.ts": "liveness only; returns the build id and reads no data",
};

const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

export type SourceFile = { path: string; text: string };

function callsRequireViewer(node: ts.Node): boolean {
  let found = false;
  const visit = (child: ts.Node) => {
    if (found) return;
    if (ts.isCallExpression(child) && ts.isIdentifier(child.expression) && child.expression.text === "requireViewer") {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

function hasUseServer(body: ts.Node | undefined): boolean {
  if (!body || !ts.isBlock(body)) return false;
  const first = body.statements[0];
  return Boolean(
    first &&
    ts.isExpressionStatement(first) &&
    ts.isStringLiteral(first.expression) &&
    first.expression.text === "use server",
  );
}

type FunctionLike = { name: string; body: ts.Node | undefined; exported: boolean; async: boolean };

function isAsync(node: ts.Node): boolean {
  return ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
}

/** Top-level functions and function-valued consts, with whether they are exported. */
function topLevelFunctions(source: ts.SourceFile): FunctionLike[] {
  const found: FunctionLike[] = [];
  for (const statement of source.statements) {
    const exported =
      ts.canHaveModifiers(statement) &&
      (ts.getModifiers(statement) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      found.push({ name: statement.name.text, body: statement.body, exported, async: isAsync(statement) });
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const init = declaration.initializer;
        if (ts.isIdentifier(declaration.name) && init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
          found.push({ name: declaration.name.text, body: init.body, exported, async: isAsync(init) });
        }
      }
    }
  }
  return found;
}

type Verdict = "guarded" | "unguarded" | "unverifiable";

function scriptKind(path: string): ts.ScriptKind {
  return path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

/** "@/lib/x" or "./x" from `from` to a repository path present in `files`, or null. */
function resolveModule(specifier: string, from: string, files: Map<string, SourceFile>): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = `src/${specifier.slice(2)}`;
  else if (specifier.startsWith(".")) base = posix.normalize(posix.join(posix.dirname(from), specifier));
  else return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (files.has(candidate)) return candidate;
  }
  return null;
}

/**
 * Whether the function exported as `name` from `path` calls requireViewer(),
 * following re-exports and imported aliases a few levels deep. Anything it
 * cannot follow (a package, a wrapper call) is "unverifiable", never "guarded".
 */
function verifyExport(path: string, name: string, files: Map<string, SourceFile>, depth = 0): Verdict {
  const file = files.get(path);
  if (!file || depth > 4) return "unverifiable";
  const source = ts.createSourceFile(path, file.text, ts.ScriptTarget.Latest, true, scriptKind(path));
  const imports = new Map<string, { module: string; imported: string }>();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        imports.set(element.name.text, {
          module: statement.moduleSpecifier.text,
          imported: (element.propertyName ?? element.name).text,
        });
      }
    }
  }
  const followImport = (local: string): Verdict => {
    const origin = imports.get(local);
    const target = origin && resolveModule(origin.module, path, files);
    return origin && target ? verifyExport(target, origin.imported, files, depth + 1) : "unverifiable";
  };

  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === name && statement.body) {
      return callsRequireViewer(statement.body) ? "guarded" : "unguarded";
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || declaration.name.text !== name) continue;
        const init = declaration.initializer;
        if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
          return callsRequireViewer(init.body) ? "guarded" : "unguarded";
        }
        return init && ts.isIdentifier(init) ? followImport(init.text) : "unverifiable";
      }
    }
    if (ts.isExportDeclaration(statement)) {
      const specifier =
        statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)
          ? statement.moduleSpecifier.text
          : null;
      const clause = statement.exportClause;
      if (!clause && specifier) {
        // export * from "...": the name may come from there.
        const target = resolveModule(specifier, path, files);
        const verdict = target ? verifyExport(target, name, files, depth + 1) : "unverifiable";
        if (verdict !== "unverifiable") return verdict;
      }
      if (clause && ts.isNamedExports(clause)) {
        for (const element of clause.elements) {
          if (element.name.text !== name) continue;
          const original = (element.propertyName ?? element.name).text;
          if (!specifier) return followImport(original);
          const target = resolveModule(specifier, path, files);
          return target ? verifyExport(target, original, files, depth + 1) : "unverifiable";
        }
      }
    }
  }
  return "unverifiable";
}

/** The names a route file exports, however it exports them. */
function exportedNames(source: ts.SourceFile): string[] {
  const names: string[] = [];
  for (const statement of source.statements) {
    const exported =
      ts.canHaveModifiers(statement) &&
      (ts.getModifiers(statement) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (exported && ts.isFunctionDeclaration(statement) && statement.name) names.push(statement.name.text);
    if (exported && ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) names.push(declaration.name.text);
      }
    }
    if (ts.isExportDeclaration(statement)) {
      if (!statement.exportClause) names.push(...HTTP_METHODS);
      else if (ts.isNamedExports(statement.exportClause))
        names.push(...statement.exportClause.elements.map((element) => element.name.text));
    }
  }
  return names;
}

/** One sentence per gap: the file, the function, and the fix. */
export function findAuthGaps(files: SourceFile[]): string[] {
  const byPath = new Map(files.map((file) => [file.path, file]));
  const gaps: string[] = [];
  for (const file of files) {
    if (PUBLIC_ROUTES[file.path]) continue;
    const source = ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true, scriptKind(file.path));
    const isLoader = /^src\/features\/[^/]+\/(bigquery|queries)\.ts$/.test(file.path);
    const isRoute = /^src\/app\/(.*\/)?route\.tsx?$/.test(file.path);
    const firstStatement = source.statements[0];
    const isActionFile = Boolean(
      firstStatement &&
      ts.isExpressionStatement(firstStatement) &&
      ts.isStringLiteral(firstStatement.expression) &&
      firstStatement.expression.text === "use server",
    );

    if (isRoute) {
      for (const name of new Set(exportedNames(source).filter((exported) => HTTP_METHODS.has(exported)))) {
        const verdict = verifyExport(file.path, name, byPath);
        if (verdict === "unguarded") {
          gaps.push(
            `\`${file.path}\` exports \`${name}\`, which handles requests without calling \`requireViewer()\`; call \`await requireViewer()\` first.`,
          );
        } else if (verdict === "unverifiable" && file.text.includes(name)) {
          gaps.push(
            `\`${file.path}\` exports \`${name}\` in a form the auth check cannot follow; define it as a function in this repository that calls \`await requireViewer()\` first.`,
          );
        }
      }
    }

    for (const fn of topLevelFunctions(source)) {
      const inScope = (isLoader && fn.exported && fn.async) || (isActionFile && fn.exported) || hasUseServer(fn.body);
      if (!inScope || callsRequireViewer(fn.body ?? source)) continue;
      const what = isLoader ? "reads data" : "is a server action";
      gaps.push(
        `\`${file.path}\` exports \`${fn.name}\`, which ${what} without calling \`requireViewer()\`; call \`await requireViewer()\` first.`,
      );
    }
  }
  return gaps;
}
