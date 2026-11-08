"use client";
import { ChartCard } from "@/components/charts/chart-card";
import { MetricChartCard, metricCard, useChartMetric, type MetricChartProps } from "@/components/charts/metric-chart";
import { REPORT_FILTER_FORM_ID } from "@/lib/filters";
import { useHydrated } from "@/hooks/use-hydrated";
import { usePresentationParams, writePresentationUrl } from "@/hooks/use-presentation-params";
import { Button } from "@/components/ui/button";
import { SHOW_TRENDS_PARAM } from "./filters";

/**
 * One trend with a measure menu, or every measure side by side. Only presentation changes; native history keeps
 * the URL. The chosen measure stays named and remembered while all trends show, so it returns when they are hidden.
 */
export function OverviewTrendSelector(props: MetricChartProps) {
  const params = usePresentationParams();
  const hydrated = useHydrated();
  const all = params.get(SHOW_TRENDS_PARAM) === "all";
  const choice = useChartMetric(
    props.param,
    props.metrics.map((metric) => metric.key),
  );
  const { param: _param, metrics, titleSuffix, ...card } = props;
  function toggleAll() {
    const url = new URL(window.location.href);
    if (all) url.searchParams.delete(SHOW_TRENDS_PARAM);
    else url.searchParams.set(SHOW_TRENDS_PARAM, "all");
    writePresentationUrl(url);
  }
  return (
    <div className="flex flex-col gap-3">
      {all && (
        <>
          <input type="hidden" name={SHOW_TRENDS_PARAM} value="all" form={REPORT_FILTER_FORM_ID} />
          <input type="hidden" name={props.param} value={choice.selected} form={REPORT_FILTER_FORM_ID} />
        </>
      )}
      {all ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {metrics.map((metric) => (
              <ChartCard key={metric.key} {...metricCard(card, metric, titleSuffix)} />
            ))}
          </div>
          <Button variant="ghost" size="sm" inert={!hydrated} onClick={toggleAll} className="self-start">
            Show selected trend
          </Button>
        </>
      ) : (
        <MetricChartCard
          {...props}
          {...choice}
          footer={
            <Button variant="ghost" size="sm" inert={!hydrated} onClick={toggleAll} className="-my-1">
              Show all trends
            </Button>
          }
        />
      )}
    </div>
  );
}
