/**
 * The published metric catalog as Explore your data reads it: alias rows fold
 * into their primary metric, a name published with more than one definition is
 * set aside rather than picked arbitrarily, each metric carries its published
 * category (or its model, for a catalog that predates categories), and search
 * runs over names, labels, descriptions, aliases and models. Pure, shared by
 * the server page and the client explorer.
 */
import type { PublishedMetric } from "@/lib/metric-binding";

export type ExplorerReport = { href: string; label: string; metrics: readonly string[] };

/** A primary metric with the alias names that resolve to it. */
export type ExplorerMetric = PublishedMetric & { aliases: string[]; category: string };
/** The listed metrics, and the names whose conflicting definitions need source review. */
export type ExplorerCatalog = { metrics: ExplorerMetric[]; conflicts: string[] };

export const UNIT_LABELS: Record<string, string> = {
  currency: "Money",
  percent: "Percent",
  ratio: "Ratio",
  count: "Count",
  number: "Number",
  identifier: "Identifier",
};

/** The first sentence of a description, for a row; the drawer shows the whole text. */
export function firstSentence(text: string | null): string {
  const trimmed = text?.trim() ?? "";
  if (!trimmed) return "No published description.";
  const match = /^.+?[.!?](?=\s|$)/.exec(trimmed);
  return match ? match[0] : trimmed;
}

/**
 * The catalog publishes a category as a key ("period_comparison"), shown in
 * words ("Period comparison"); an older catalog has none, so the metric's
 * model stands in under its own name.
 */
export function metricCategory(metric: PublishedMetric): string {
  const published = metric.metric_category?.replace(/[_\s]+/g, " ").trim();
  if (published) return published.charAt(0).toUpperCase() + published.slice(1);
  return metric.underlying_model?.trim() || "Uncategorized";
}

function entry(metric: PublishedMetric): ExplorerMetric {
  const aliases = (metric.abbreviations_list ?? "")
    .split(",")
    .map((alias) => alias.trim())
    .filter(Boolean);
  return { ...metric, aliases, category: metricCategory(metric) };
}

/**
 * Alias rows (`is_abbreviation`, such as "aov") fold into their primary metric,
 * so a search for an abbreviation finds one entry, never two; an alias whose
 * primary is not in the loaded catalog stays findable as its own entry.
 */
export function explorerCatalog(rows: readonly PublishedMetric[]): ExplorerCatalog {
  const counts = new Map<string, number>();
  for (const metric of rows) counts.set(metric.metric_name, (counts.get(metric.metric_name) ?? 0) + 1);
  const conflicts = [...counts].flatMap(([name, count]) => (count > 1 ? [name] : [])).sort();
  const unique = rows.filter((metric) => counts.get(metric.metric_name) === 1);
  const listed = new Map(
    unique.filter((metric) => !metric.is_abbreviation).map((metric) => [metric.metric_name, entry(metric)]),
  );
  for (const metric of unique) {
    if (!metric.is_abbreviation) continue;
    const primary = metric.preferred_metric_name ? listed.get(metric.preferred_metric_name) : undefined;
    if (!primary) listed.set(metric.metric_name, entry(metric));
    else if (!primary.aliases.includes(metric.metric_name)) primary.aliases.push(metric.metric_name);
  }
  const metrics = [...listed.values()].sort((a, b) =>
    (a.metric_label ?? a.metric_name).localeCompare(b.metric_label ?? b.metric_name),
  );
  return { metrics, conflicts };
}

export function matchesSearch(metric: ExplorerMetric, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    metric.metric_name,
    metric.metric_label,
    metric.metric_description,
    metric.underlying_model,
    metric.category,
    ...metric.aliases,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return needle.split(/\s+/).every((word) => haystack.includes(word));
}
