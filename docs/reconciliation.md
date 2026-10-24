# Reconcile a reference before calling a report correct

Connection verifies access, not metric definitions or freshness. Before replacing an existing dashboard, choose a completed reference period and freeze its store, calendar dates and time zone, reporting currency, selected sales channels, advertising platform and attribution window. Copy the app's scoped CSV after querying live data, and keep both references privately under `.sm/`.

Start with one business period and one platform period. Record each expected total and its source field definition in a JSON reference like this:

```json
{
  "report": "business",
  "source": "Reviewed reference dashboard, exact page and filter state",
  "store": "your-store-id",
  "from": "2026-09-01",
  "to": "2026-09-30",
  "currency": "USD",
  "channels": ["your-reviewed-channel"],
  "grain": "month",
  "platform": "",
  "metrics": [
    {
      "field": "revenue",
      "expected": "100.00",
      "tolerance": "0.01",
      "definition": "SUM(order_net_revenue), after discounts and refunds"
    },
    {
      "field": "orders",
      "expected": "10",
      "definition": "SUM(order_count) from Executive Summary, not valid-order detail"
    }
  ]
}
```

These values are illustrative, not verified business data. Replace every scope value, expected total and definition with reviewed reference evidence. `report` is `overview`, `business` or `platforms`; use the exact exported column names. For an individual advertising platform, use its source_system value in `platform`; empty means combined platforms. An empty channel array means every published row, including non-valid channels; the summary reports' default export lists SourceMedium's valid channels instead, so copy the export's `sales_channel` value.

```sh
pnpm reconcile .sm/reference.json .sm/live-export.csv
```

The command requires live data, matching scope and exactly one full-selection total. It compares decimal text exactly at up to nine fractional places, with only the tolerance you provide. Platform FLOAT64 values with greater precision or exponent notation remain unresolved; review their precision explicitly rather than silently rounding them. It writes a private `.sm/reconciliation-report.json`, prints MATCH or UNRESOLVED per measure and exits unsuccessfully for unresolved measures. A match only covers the recorded definition, scope and tolerance. It does not prove the definition was chosen correctly or establish freshness.

Investigate scope first, then field definitions, null handling, row grain, attribution windows and click measures. Do not add deduplication to platform data whose hidden breakdowns are additive. Do not alter SQL to force a reference value. Keep unresolved differences visible with the likely cause and evidence needed to close them.

Summary order counts are published FLOAT64 measures and can differ from valid-order detail. New and repeat purchase counts are order measures, not unique customers. Unique customer totals are not additive across periods or channel groups; CAC needs a separately reviewed customer denominator. Demand before returns uses published gross revenue after discounts. MER uses store net revenue. Platform revenue and conversions sum platform claims, which can overlap and are not deduplicated store sales.

The summary reports offer independent daily, Monday-weekly and monthly grains, full-selection totals, partial edge-period labels and CSV. Summary ranges are deliberately bounded by `appConfig.summaryMaxDays`; detail views keep `dateRange.maxDays`. `defaultSalesChannels` is a customer-owned list that starts as SourceMedium's valid channels. Choosing **All channels, including non-valid** writes an explicit empty URL value so defaults cannot silently reapply. Existing one-channel links remain valid; multiple selections use a canonical JSON array in `sales_channel` and bound SQL parameters.

Geography references use `report: "geography"`, `grain: "day"`, and an explicit `date_basis: "created" | "processed"`; include `country` and `region` when filtered. Its CSV always names `population: valid` and must match every destination and date-basis field. Explicit processed uses the catalog's created-date fallback; a processed-only external reference is not equivalent. Use the new `/geography/export` endpoint and its independent total, not a sum of visible map groups. A missing or empty authorized reference remains unresolved.
