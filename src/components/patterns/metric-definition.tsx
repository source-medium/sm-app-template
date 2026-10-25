import type { MetricBinding } from "@/lib/metric-binding";

export type MetricScope = { filters: Record<string, string | null>; timeZone?: string; currency: string | null };

/** A store's reporting currency where it is listed, or why amounts carry none. */
export function currencyValue(currency: string | null): string {
  return currency ?? "Unknown; amounts are unlabeled";
}

/** Shared content for AboutData and a number's existing inline disclosure. */
export function MetricDefinition({ binding, scope }: { binding: MetricBinding; scope?: MetricScope }) {
  const rows = [
    ["Identity", binding.canonical ? `Canonical: ${binding.canonical.metric_name}` : "Report-specific calculation"],
    ["Reviewed published definition", binding.canonical?.metric_description],
    ["Report calculation", binding.calculation],
    ["Numerator", binding.numerator],
    ["Denominator", binding.denominator],
    ["Source", `${binding.source}: ${binding.fields.join(", ")}`],
    ["Grain", binding.grain],
    ["Report population", binding.population],
    ["Date basis", binding.dateBasis],
    ["Timezone", scope?.timeZone],
    ["Reporting currency", scope ? currencyValue(scope.currency) : undefined],
    ["Attribution", binding.attribution],
    [
      "Dependency status",
      "Live dependency evidence is not established by this definition. Review the report’s Source evidence findings.",
    ],
    [
      "Published dependencies",
      binding.canonical?.dependent_metrics ?? (binding.canonical ? "None published" : undefined),
    ],
  ];
  return (
    <div className="space-y-3 text-sm leading-relaxed">
      <dl className="space-y-2">
        {rows
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label}>
              <dt className="font-medium text-foreground">{label}</dt>
              <dd className="break-words">{value}</dd>
            </div>
          ))}
        {scope && (
          <div>
            <dt className="font-medium text-foreground">Applied report filters</dt>
            <dd>
              {Object.entries(scope.filters)
                .map(([key, value]) => `${key.replaceAll("_", " ")}: ${value ?? "All"}`)
                .join("; ")}
            </dd>
          </div>
        )}
      </dl>
      {binding.limitations?.map((text) => (
        <p key={text}>{text}</p>
      ))}
      <p>
        Published metadata explains the definition. It does not establish live reconciliation, source completeness or
        verified attribution settings.
      </p>
    </div>
  );
}
