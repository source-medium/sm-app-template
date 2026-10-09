/** Features declare only the sources they use; the shell never imports a feature. */
import type { DictionaryField } from "./data/dictionary-report";
export type { DictionaryField, DictionaryReport } from "./data/dictionary-report";

export type ReportSource = { relation: string; scope: string };

export const DICTIONARY_FIELD_LIMIT = 500;

export type AgentField = DictionaryField & { relation: string; origin: "sample" | "live" };
export const USE_AGENT_FIELD = "sm:use-agent-field";
