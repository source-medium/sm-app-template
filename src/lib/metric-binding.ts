/** Presentation contracts, never executable expressions or an alternate metric registry. */
export const VALUE_FORMATS = ["currency", "percent", "ratio", "count", "number", "identifier"] as const;
export type ValueFormat = (typeof VALUE_FORMATS)[number];

export type PublishedMetric = {
  metric_name: string;
  metric_label: string | null;
  metric_description: string | null;
  calculation: string | null;
  has_filter: boolean | null;
  filter_condition: string | null;
  dependent_metrics: string | null;
  underlying_model: string | null;
  metric_time_expression: string | null;
  metric_time_grains: string | null;
  value_format: string | null;
  preferred_metric_name?: string | null;
  abbreviations_list?: string | null;
  catalog_updated_at?: string | null;
  /** Published grouping, such as "Revenue" or "Marketing"; null when the catalog predates it. */
  metric_category?: string | null;
  metric_type?: string | null;
  /** An alias row ("aov") whose preferred_metric_name is the primary metric. */
  is_abbreviation?: boolean | null;
  semantic_model_name?: string | null;
  cumulative_settings?: string | null;
};

export type MetricBinding = {
  id: string;
  label: string;
  /** Omit for a report-specific calculation; a similar label is not equivalence. */
  canonical?: PublishedMetric;
  /** Reviewed producer snapshots of transitive dependencies used by this binding. */
  reviewedDependencies?: readonly PublishedMetric[];
  calculation: string;
  source: string;
  fields: readonly string[];
  population: string;
  grain: string;
  dateBasis: string;
  attribution: string;
  format: ValueFormat;
  numerator?: string;
  denominator?: string;
  limitations?: readonly string[];
  drilldowns?: readonly string[];
};

/** IDs are comma-separated exact identifiers, never substrings or display labels. */
export function dependencyIds(value: string | null): string[] {
  return [
    ...new Set(
      (value ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ];
}

function normalized(value: string | boolean | null): string | boolean | null {
  return typeof value === "string" ? value.split(/\s+/).join(" ").trim() : value;
}

export function metricCompatibility(binding: MetricBinding, metrics: readonly PublishedMetric[]): string[] {
  if (!binding.canonical) return [];
  const byId = new Map<string, PublishedMetric[]>();
  for (const metric of metrics) byId.set(metric.metric_name, [...(byId.get(metric.metric_name) ?? []), metric]);
  const findings = new Set<string>();
  const visited = new Set<string>();
  const active = new Set<string>();
  const expected = new Map(
    [binding.canonical, ...(binding.reviewedDependencies ?? [])].map((metric) => [metric.metric_name, metric]),
  );
  function visit(id: string) {
    if (active.has(id)) {
      findings.add(`Dependency cycle at ${id}.`);
      return;
    }
    if (visited.has(id)) return;
    visited.add(id);
    const rows = byId.get(id);
    if (!rows?.length) {
      findings.add(`Published definition unavailable: ${id}.`);
      return;
    }
    if (rows.length !== 1) {
      findings.add(`Conflicting published definitions: ${id}.`);
      return;
    }
    active.add(id);
    for (const dependency of dependencyIds(rows[0]?.dependent_metrics ?? null)) visit(dependency);
    active.delete(id);
  }
  visit(binding.canonical.metric_name);
  for (const id of visited) {
    const actual = byId.get(id)?.[0];
    const reviewed = expected.get(id);
    if (actual && !reviewed) findings.add(`Dependency has no reviewed fixture: ${id}.`);
    if (actual && reviewed) {
      // Descriptions are prose and are displayed, not compared: a reworded description is not a
      // definition change. Catalog builds also fold YAML line breaks, so compare text on whitespace-normalized form.
      for (const key of [
        "calculation",
        "has_filter",
        "filter_condition",
        "underlying_model",
        "metric_time_expression",
        "metric_time_grains",
      ] as const) {
        if (normalized(actual[key]) !== normalized(reviewed[key]))
          findings.add(`${id}: published ${key.replaceAll("_", " ")} changed; maintainer review required.`);
      }
      if (
        dependencyIds(actual.dependent_metrics).sort().join("|") !==
        dependencyIds(reviewed.dependent_metrics).sort().join("|")
      )
        findings.add(`${id}: published dependencies changed; maintainer review required.`);
      if (actual.value_format !== null && actual.value_format !== reviewed.value_format)
        findings.add(`${id}: published display unit differs; reviewed report formatting retained.`);
    }
  }
  return [...findings];
}
