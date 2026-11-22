import { z } from "zod";
import { safeImageUrl } from "@/lib/image-url";
import { bq } from "@/lib/data/decode";
import { addDays, rangeLength, type DateRange } from "@/lib/filters";
import { periodCoverageFields, periodFields, type PeriodPrefix } from "@/lib/data/period-sql";
import { adTotals, adTotalsFields } from "@/lib/ad-totals";
import type { Creative, CreativeMeasures, CreativeSummary, CreativeSummaryGroup } from "./queries";

export const CREATIVE_RELATION = "rpt_ad_performance_daily";
/** Cards per page of the grid; more is reported as truncation. */
export const MAX_CREATIVES = 48;
/**
 * How far before the selected range a creative's first spend is looked for.
 * A creative that already spent on that first day reads as running before it,
 * never as launched then: its true launch is older than the lookback.
 */
export const LAUNCH_LOOKBACK_DAYS = 365;

/** The first day searched for a creative's first spend: the lookback before the selected range. */
export function lookbackStart(from: string): string {
  return addDays(from, -LAUNCH_LOOKBACK_DAYS);
}

/**
 * The first day searched for a creative's latest format: the earliest day a
 * comparison can start, a year before the selected range (366 days, so a
 * leap-year comparison fits) or its length before it when that is longer. It is
 * never later than lookbackStart(), so one scan also finds the first spend, and
 * a creative keeps one format whichever comparison is shown.
 */
export function formatLookbackStart(range: DateRange): string {
  return addDays(range.from, -Math.max(rangeLength(range), 366));
}

/**
 * When a creative first spent, relative to the selected dates: in them
 * (launched), in the lookback year before them (running), or already on the
 * lookback's first day, so before that year (older).
 */
export type FirstSpend = { when: "launched" | "running"; date: string } | { when: "older" };

export function firstSpend(firstDate: string | null, from: string): FirstSpend | null {
  if (firstDate === null) return null;
  if (firstDate >= from) return { when: "launched", date: firstDate };
  return firstDate > lookbackStart(from) ? { when: "running", date: firstDate } : { when: "older" };
}

/** Ratios of each period's sums, computed in SQL after aggregation. */
const RATIO_MEASURES = ["roas", "cpo", "ctr"] as const;

export const CreativeChannelRow = z.object({ channel: bq.string() });
export const CreativeRow = z.object({
  creative_id: bq.string(),
  title: bq.string().nullable(),
  body: bq.string().nullable(),
  name: bq.string().nullable(),
  image_url: bq.string().nullable(),
  video_url: bq.string().nullable(),
  thumbnail_url: bq.string().nullable(),
  call_to_action: bq.string().nullable(),
  channel: bq.string(),
  format: bq.string().nullable(),
  post_url: bq.string().nullable(),
  ad_url: bq.string().nullable(),
  /** The creative's first day with spend since the lookback began; null when it never spent. */
  first_date: bq.date().nullable(),
  ...adTotalsFields,
  ...periodFields(RATIO_MEASURES, bq.float64().nullable()),
  ...periodCoverageFields,
});

/**
 * One row per grouping of the summary query: the scope's totals, each format,
 * and each launch week (null: running before the range). `has_creative` is
 * false for delivery with no creative identity, which only the coverage line
 * reads.
 */
export const CreativeSummaryRow = z.object({
  kind: z.enum(["total", "format", "launch"]),
  has_creative: bq.bool(),
  format: bq.string().nullable(),
  launch_week: bq.date().nullable(),
  ...adTotalsFields,
  ...periodFields(["creatives"], bq.int64().nullable()),
  new_creatives: bq.int64().nullable(),
  ...periodCoverageFields,
});

/** Platform post and ad links that become an external action; anything else is dropped. */
const POST_HOSTS = [
  "facebook.com",
  "instagram.com",
  "tiktok.com",
  "pinterest.com",
  "x.com",
  "twitter.com",
  "reddit.com",
  "snapchat.com",
  "youtube.com",
  "linkedin.com",
];

/** Only verified HTTPS platform post URLs become external actions. */
export function safeAdUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      POST_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`))
      ? url.href
      : null;
  } catch {
    return null;
  }
}

type Row = z.output<typeof CreativeRow>;
type SummaryRow = z.output<typeof CreativeSummaryRow>;

function measures(row: Row, prefix: PeriodPrefix): CreativeMeasures {
  return {
    spend: row[`${prefix}spend`],
    impressions: row[`${prefix}impressions`],
    clicks: row[`${prefix}clicks`],
    conversions: row[`${prefix}conversions`],
    revenue: row[`${prefix}revenue`],
    roas: row[`${prefix}roas`],
    cpo: row[`${prefix}cpo`],
    ctr: row[`${prefix}ctr`],
  };
}

/** Live creative media must be HTTPS; bundled sample assets are allowed only when opted in. */
function safeMediaUrl(value: string | null, allowSamplePaths: boolean): string | null {
  const url = safeImageUrl(value);
  if (!url) return null;
  if (url.startsWith("https://")) return url;
  return allowSamplePaths && url.startsWith("/sample-creatives/") ? url : null;
}

export function toCreative(
  row: Row,
  range: { from: string },
  assets: Creative["assets"] = "unknown",
  extras: Creative["media"] = [],
  { allowSamplePaths = false }: { allowSamplePaths?: boolean } = {},
): Creative {
  const cover = safeMediaUrl(row.image_url, allowSamplePaths) ?? safeMediaUrl(row.thumbnail_url, allowSamplePaths);
  const video = safeMediaUrl(row.video_url, allowSamplePaths);
  const media: Creative["media"] = [];
  if (video) media.push({ kind: "video", src: video, poster: cover });
  else if (cover) media.push({ kind: "image", src: cover });
  for (const item of extras) {
    if (
      !media.some((existing) => existing.kind === item.kind && existing.src === item.src) &&
      !(video && item.kind === "image" && item.src === cover)
    )
      media.push(item);
  }
  return {
    creativeId: row.creative_id,
    assets,
    title: row.title,
    body: row.body,
    name: row.name,
    imageUrl: cover ?? media.find((item) => item.kind === "image")?.src ?? null,
    media,
    callToAction: row.call_to_action,
    channel: row.channel,
    format: row.format,
    firstSpend: firstSpend(row.first_date, range.from),
    ...measures(row, ""),
    baselines: [measures(row, "previous_"), measures(row, "second_")],
    adUrl: safeAdUrl(row.post_url) ?? safeAdUrl(row.ad_url),
  };
}

function group(row: SummaryRow, prefix: PeriodPrefix): CreativeSummaryGroup {
  return { ...adTotals(row, prefix), creatives: row[`${prefix}creatives`] };
}

/** The summary rows, sorted into the scope's totals, its formats and its launch weeks. */
export function toCreativeSummary(rows: SummaryRow[]): CreativeSummary {
  const total = rows.find((row) => row.kind === "total" && row.has_creative);
  const uncovered = rows.find((row) => row.kind === "total" && !row.has_creative);
  const periods = (row: SummaryRow) => ({
    current: group(row, ""),
    baselines: [group(row, "previous_"), group(row, "second_")] as const,
  });
  return {
    totals: total ? periods(total) : null,
    newCreatives: total?.new_creatives ?? null,
    uncoveredSpend: uncovered?.spend ?? null,
    coverage: total
      ? {
          latest_date: total.latest_date,
          previous_latest_date: total.previous_latest_date,
          second_latest_date: total.second_latest_date,
        }
      : null,
    formats: rows
      .filter((row) => row.kind === "format" && row.has_creative)
      .map((row) => ({ format: row.format, ...periods(row) })),
    launches: rows
      .filter((row) => row.kind === "launch" && row.has_creative && row.spend !== null)
      .map((row) => ({ week: row.launch_week, ...group(row, "") })),
  };
}
