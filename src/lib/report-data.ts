/** Features declare only the sources they use; the shell never imports a feature. */
import type { DictionaryField } from "./data/dictionary-report";
export type { DictionaryField, DictionaryReport } from "./data/dictionary-report";

export type ReportSource = { relation: string; scope: string };

export const DICTIONARY_FIELD_LIMIT = 500;

export type AgentField = DictionaryField & { relation: string; origin: "sample" | "live" };
export const USE_AGENT_FIELD = "sm:use-agent-field";

/** A bounded report's raw JSON. INT64 stays decimal text, never a rounded JS number. */
export function reportJsonResponse(filename: string, rawResults: unknown, context: unknown): Response {
  if (!/^[a-zA-Z0-9_.-]+\.json$/.test(filename)) throw new Error("Report filenames must be plain .json names.");
  return new Response(
    JSON.stringify({ context, results: rawResults }, (_key, value: unknown) =>
      typeof value === "bigint" ? value.toString() : value,
    ),
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
