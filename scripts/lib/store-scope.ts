/**
 * The store-scope rule: every SQL template under src/features that reads a
 * relation through warehouse.table() filters it with `sm_store_id = @store_id`,
 * once for each relation it reads.
 *
 * The query boundary in warehouse.server.ts checks only that a fixed-store app
 * passes the right store_id parameter; it cannot see whether the SQL uses it.
 * This makes a missing predicate fail `pnpm check` instead of returning other
 * stores' rows. It reads source text: a coding guardrail, not a SQL parser.
 *
 * STORE_SCOPE_EXEMPT lists feature files that read a relation without
 * sm_store_id, each with why.
 */
import ts from "typescript";
import type { SourceFile } from "./auth-coverage";

export const STORE_SCOPE_EXEMPT: Record<string, string> = {};

const PREDICATE = /\bsm_store_id\s*=\s*@store_id\b/g;

function isTableCall(node: ts.Node): boolean {
  return (
    ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "table"
  );
}

/** One sentence per gap: the file and line, and the fix. */
export function findStoreScopeGaps(files: SourceFile[]): string[] {
  const gaps: string[] = [];
  for (const file of files) {
    if (!/^src\/features\/.+\.tsx?$/.test(file.path) || STORE_SCOPE_EXEMPT[file.path]) continue;
    const source = ts.createSourceFile(
      file.path,
      file.text,
      ts.ScriptTarget.Latest,
      true,
      file.path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    // Names bound to a relation, such as `const table = warehouse.table(AD_RELATION)`.
    const tables = new Set<string>();
    const collect = (node: ts.Node) => {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        isTableCall(node.initializer)
      )
        tables.add(node.name.text);
      ts.forEachChild(node, collect);
    };
    collect(source);
    const visit = (node: ts.Node) => {
      if (ts.isTemplateExpression(node)) {
        const reads = node.templateSpans.filter(
          (span) =>
            isTableCall(span.expression) || (ts.isIdentifier(span.expression) && tables.has(span.expression.text)),
        ).length;
        const text = [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(" ");
        if (reads > (text.match(PREDICATE)?.length ?? 0)) {
          const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
          gaps.push(
            `\`${file.path}:${line}\` reads a warehouse relation without its own \`sm_store_id = @store_id\`; filter each relation in that SQL by the store parameter, or an APP_STORE_ID app can return other stores' rows.`,
          );
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return gaps;
}
