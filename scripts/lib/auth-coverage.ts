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

/** One sentence per gap: the file, the function, and the fix. */
export function findAuthGaps(files: SourceFile[]): string[] {
  const gaps: string[] = [];
  for (const file of files) {
    if (PUBLIC_ROUTES[file.path]) continue;
    const source = ts.createSourceFile(file.path, file.text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const isLoader = /^src\/features\/[^/]+\/(bigquery|queries)\.ts$/.test(file.path);
    const isRoute = /^src\/app\/.*\/route\.tsx?$/.test(file.path) || /^src\/app\/route\.tsx?$/.test(file.path);
    const firstStatement = source.statements[0];
    const isActionFile = Boolean(
      firstStatement &&
      ts.isExpressionStatement(firstStatement) &&
      ts.isStringLiteral(firstStatement.expression) &&
      firstStatement.expression.text === "use server",
    );

    for (const fn of topLevelFunctions(source)) {
      const inScope =
        (isLoader && fn.exported && fn.async) ||
        (isRoute && fn.exported && HTTP_METHODS.has(fn.name)) ||
        (isActionFile && fn.exported) ||
        hasUseServer(fn.body);
      if (!inScope || callsRequireViewer(fn.body ?? source)) continue;
      const what = isRoute ? "handles requests" : isLoader ? "reads data" : "is a server action";
      gaps.push(
        `\`${file.path}\` exports \`${fn.name}\`, which ${what} without calling \`requireViewer()\`; call \`await requireViewer()\` first.`,
      );
    }
  }
  return gaps;
}
