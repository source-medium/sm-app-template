"use client";
import { useSearchParams } from "next/navigation";
import { ChartCard, type ChartCardProps } from "@/components/charts/chart-card";
import { REPORT_FILTER_FORM_ID } from "@/lib/filters";
import { Button } from "@/components/ui/button";

/** Only presentation changes. Native history updates preserve URLs without a server navigation. */
export function OverviewTrendSelector({ charts }: { charts: (ChartCardProps & { key: string; label: string })[] }) {
  const params = useSearchParams();
  const selected = charts.some((chart) => chart.key === params.get("metric")) ? params.get("metric") : charts[0]?.key;
  const all = params.get("show_trends") === "all";
  function choose(key: string, value: string | null) {
    const url = new URL(window.location.href);
    if (value === null) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
    window.history.pushState(null, "", url);
  }
  return (
    <div className="space-y-3">
      <input type="hidden" name="metric" value={selected ?? "revenue"} form={REPORT_FILTER_FORM_ID} />
      {all && <input type="hidden" name="show_trends" value="all" form={REPORT_FILTER_FORM_ID} />}
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Trend metric">
        {charts.map((chart) => (
          <Button
            key={chart.key}
            variant={selected === chart.key && !all ? "default" : "outline"}
            size="sm"
            aria-pressed={selected === chart.key && !all}
            onClick={() => {
              const url = new URL(window.location.href);
              url.searchParams.set("metric", chart.key);
              url.searchParams.delete("show_trends");
              window.history.pushState(null, "", url);
            }}
          >
            {chart.label}
          </Button>
        ))}
        <Button variant="ghost" size="sm" aria-pressed={all} onClick={() => choose("show_trends", all ? null : "all")}>
          Show all trends
        </Button>
      </div>
      <div className={all ? "grid gap-4 lg:grid-cols-2" : "min-w-0"}>
        {charts
          .filter((chart) => all || chart.key === selected)
          .map(({ key, ...chart }) => (
            <ChartCard key={key} {...chart} />
          ))}
      </div>
    </div>
  );
}
