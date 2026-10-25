/** Features declare only the sources they use; the shell never imports a feature. */
import type { DictionaryField } from "./data/dictionary-report";
export type { DictionaryField, DictionaryReport } from "./data/dictionary-report";

export type ReportSource = { relation: string; scope: string };

export const DICTIONARY_FIELD_LIMIT = 500;

export type AgentField = DictionaryField & { relation: string; origin: "sample" | "live" };
export const USE_AGENT_FIELD = "sm:use-agent-field";

/**
 * A published metric handed to the composer from Explore your data: its
 * canonical identity and reviewed definition, never row values.
 */
export type AgentMetric = {
  name: string;
  label: string | null;
  description: string | null;
  calculation: string | null;
  filter: string | null;
  model: string | null;
  timeExpression: string | null;
  unit: string | null;
  dependencies: string[];
  /** Report routes in this app that already present the metric, or none. */
  reports: string[];
  origin: "sample" | "live";
};
export const USE_AGENT_METRIC = "sm:use-agent-metric";
