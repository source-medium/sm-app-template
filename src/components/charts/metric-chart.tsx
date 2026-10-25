"use client";

/**
 * A chart that can show any of a few measures its loaded rows already carry.
 * The feature formats every option on the server, so switching makes no
 * request. List `param` in the page's `ReportPage chartParams`.
 *
 * A valid URL value wins, so Back, reloads and copied links reproduce a named
 * measure; the URL names every measure except an untouched default. This
 * browser also remembers the measure each chart last showed
 * (`lib/chart-memory.ts`), which applies wherever the URL names none: links the
 * server builds never carry the param, so following one resumes the live
 * measure rather than the one the page was loaded with.
 */
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { ChevronDownIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useHydrated } from "@/hooks/use-hydrated";
import { usePresentationParams, writePresentationUrl } from "@/hooks/use-presentation-params";
import { REPORT_FILTER_FORM_ID } from "@/lib/filters";
import { ChartCard, type ChartCardProps } from "./chart-card";
import { useChartMemory } from "./chart-memory";

type MeasureFields = "series" | "data" | "plottable" | "valueFormat" | "description" | "definition";
/** One measure the chart can show; a description or definition here replaces the card's. */
export type ChartMetric = { key: string; label: string } & Pick<ChartCardProps, MeasureFields>;

/** What every measure's card shares. */
export type MetricCardProps = Omit<ChartCardProps, MeasureFields | "title" | "heading"> &
  Pick<ChartCardProps, "description" | "definition">;

export type MetricChartProps = MetricCardProps & {
  /** The URL key for the choice, unique on its page. */
  param: string;
  /** The first is the default. */
  metrics: ChartMetric[];
  /** Words after the measure name, such as "by day". */
  titleSuffix?: string;
};

/**
 * Which measure to show. `fromUrl` is the page's param (a shared link or
 * Back), `remembered` is this browser's last shown measure, and `keys` lists
 * the chart's measures with the default first. Either input can be stale or
 * hand-edited, so only a key the chart offers may win.
 */
export function resolveMetric(fromUrl: string | null, remembered: string | undefined, keys: string[]): string {
  const offered = (value: string | null | undefined) => (value != null && keys.includes(value) ? value : undefined);
  return offered(fromUrl) ?? offered(remembered) ?? keys[0] ?? "";
}

/** The card for one measure; its own description or definition replaces the shared one. */
export function metricCard(
  card: MetricCardProps,
  { key: _key, label, ...measure }: ChartMetric,
  titleSuffix?: string,
): ChartCardProps {
  return {
    ...card,
    ...measure,
    description: measure.description ?? card.description,
    definition: measure.definition ?? card.definition,
    title: titleSuffix ? `${label} ${titleSuffix}` : label,
  };
}

/** The current address with one param set; a fresh object for each history call. */
function urlWith(param: string, value: string) {
  const url = new URL(window.location.href);
  url.searchParams.set(param, value);
  return url;
}

/** The shown measure, named in the URL unless it is an untouched default, and remembered in this browser. */
export function useChartMetric(param: string, keys: string[]) {
  const params = usePresentationParams();
  const pathname = usePathname();
  const [remembered, remember] = useChartMemory(`${pathname}:${param}`);
  const fromUrl = params.get(param);
  const selected = resolveMetric(fromUrl, remembered, keys);
  const fallback = keys[0];
  const switchable = keys.length > 1;
  const named = fromUrl === selected || selected !== fallback;

  useEffect(() => {
    if (!switchable || ((!named || fromUrl === selected) && remembered === selected)) return;
    // Next patches history in its router's effect, which on first hydration runs after this one.
    const timer = setTimeout(() => {
      if (named && fromUrl !== selected) writePresentationUrl(urlWith(param, selected), "replace");
      if (remembered !== selected) remember(selected);
    });
    return () => clearTimeout(timer);
  }, [switchable, named, fromUrl, remembered, selected, param, remember]);

  function choose(key: string) {
    if (key === selected) return;
    // Name the entry being left, so Back returns to its measure rather than the remembered one.
    if (fromUrl !== selected) writePresentationUrl(urlWith(param, selected), "replace");
    writePresentationUrl(urlWith(param, key));
    remember(key);
  }
  return { selected, choose };
}

export function MetricChart(props: MetricChartProps) {
  const choice = useChartMetric(
    props.param,
    props.metrics.map((metric) => metric.key),
  );
  return <MetricChartCard {...props} {...choice} />;
}

/** The chart for the measure `useChartMetric` chose, with a menu in its title. */
export function MetricChartCard({
  param,
  metrics,
  titleSuffix,
  selected,
  choose,
  ...card
}: MetricChartProps & ReturnType<typeof useChartMetric>) {
  const hydrated = useHydrated();
  const metric = metrics.find((item) => item.key === selected);
  if (!metric) return null;
  const shown = metricCard(card, metric, titleSuffix);
  if (metrics.length < 2) return <ChartCard {...shown} />;
  return (
    <>
      {/* Filter submits keep this tab's displayed measure, including the default. */}
      <input type="hidden" name={param} value={selected} form={REPORT_FILTER_FORM_ID} />
      <ChartCard
        {...shown}
        heading={
          <>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                {/* A choice before hydration would be lost, so the menu opens only once it can apply one. */}
                <button
                  type="button"
                  inert={!hydrated}
                  aria-label={`Measure: ${metric.label}`}
                  data-agent-element="Chart measure"
                  className="-mx-1 inline-flex items-center gap-1 rounded-md px-1 text-left font-semibold hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-[state=open]:bg-muted pointer-coarse:min-h-11 pointer-coarse:min-w-11"
                >
                  {metric.label}
                  <ChevronDownIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuRadioGroup value={selected} onValueChange={choose}>
                  {metrics.map((item) => (
                    <DropdownMenuRadioItem key={item.key} value={item.key}>
                      {item.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            {titleSuffix && ` ${titleSuffix}`}
          </>
        }
      />
    </>
  );
}
