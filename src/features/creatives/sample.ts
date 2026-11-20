/**
 * Creatives, sample. Nine evergreen creatives with local placeholder images,
 * a few text-only cards, and one image that fails to load, so the text
 * fallback is visible from the first run; plus a new creative launching every
 * ten days that ramps up and then tires, so launches, formats and period
 * changes have something to show. Their delivery is the shared sample ad
 * delivery (lib/sample/ad-delivery), each ad's day split across the creatives
 * it ran, so the creatives plus the spend no creative ran add up to Paid
 * marketing's totals. Every value depends only on the store and the date, so
 * any period reads the same day the same way. No external image host is
 * referenced.
 */
import { ASSET_PAGE_SIZE, type AssetScope, type CreativeAsset } from "./assets";
import { decodeRows } from "@/lib/data/decode";
import { fromUnits, toUnits } from "@/lib/data/decimal";
import { addDays, type DateRange, type ReportFilters } from "@/lib/filters";
import type { BaselineRanges } from "@/lib/comparison";
import { seededRandom } from "@/lib/sample/random";
import { SAMPLE_STORE_SCALE } from "@/lib/sample/stores";
import { sampleAdNames, sampleNameMatches } from "@/lib/sample/ad-names";
import { samplePaidSource, type PaidSourceRow } from "@/lib/sample/ad-delivery";
import { matchesAdNames, type AdNames } from "@/lib/ad-name-filters";
import { periodStart } from "@/lib/time-grain";
import { PERIOD_PREFIXES, type PeriodPrefix } from "@/lib/data/period-sql";
import type { CreativeSummary, CreativesData, CreativesFilters } from "./queries";
import type { CreativeSort } from "./filters";
import {
  CREATIVE_RELATION,
  CreativeRow,
  CreativeSummaryRow,
  firstSpend,
  lookbackStart,
  MAX_CREATIVES,
  toCreative,
  toCreativeSummary,
} from "./rows";

type SampleCreative = {
  id: string;
  campaign: string;
  source_system: string;
  image: string | null;
  title: string;
  body: string;
  cta: string | null;
  reach: number;
  format: string;
  /** A flight's first and last days; evergreen creatives run every day. */
  flight?: { from: string; to: string };
};

const EVERGREEN: readonly SampleCreative[] = [
  {
    id: "crv-01",
    campaign: "cmp-1001",
    source_system: "meta_ads",
    image: "/sample-creatives/creative-01.svg",
    title: "Meet the everyday tote",
    body: "Built for the commute, the market, and everything after. Free returns, always.",
    cta: "SHOP_NOW",
    reach: 1,
    format: "image",
  },
  {
    id: "crv-02",
    campaign: "cmp-1001",
    source_system: "meta_ads",
    image: "/sample-creatives/creative-02.svg",
    title: "Back in stock: the linen set",
    body: "Our most-requested set is back in four colors. Restocks sell out fast.",
    cta: "SHOP_NOW",
    reach: 0.8,
    format: "carousel",
  },
  {
    id: "crv-03",
    campaign: "cmp-1002",
    source_system: "meta_ads",
    image: "/sample-creatives/creative-03.svg",
    title: "Customers on repeat",
    body: "“I bought one and came back for three more.” See why reviewers call it a staple.",
    cta: "LEARN_MORE",
    reach: 0.65,
    format: "video",
  },
  {
    id: "crv-04",
    campaign: "cmp-1002",
    source_system: "meta_ads",
    image: "/sample-creatives/creative-04.svg",
    title: "Weekend sale: 20% off",
    body: "Two days only. The whole collection, no code needed.",
    cta: "SHOP_NOW",
    reach: 0.55,
    format: "image",
  },
  {
    id: "crv-05",
    campaign: "cmp-1003",
    source_system: "meta_ads",
    image: "/sample-creatives/creative-05.svg",
    title: "Gift it this season",
    body: "Wrapped, tagged, and shipped in two days.",
    cta: "SHOP_NOW",
    reach: 0.4,
    format: "flexible",
  },
  {
    id: "crv-06",
    campaign: "cmp-1003",
    source_system: "meta_ads",
    image: "/sample-creatives/creative-06.svg",
    title: "How it's made",
    body: "A two-minute look inside the workshop where every piece is finished by hand.",
    cta: "WATCH_MORE",
    reach: 0.35,
    format: "video",
  },
  {
    id: "crv-07",
    campaign: "cmp-1001",
    source_system: "meta_ads",
    image: "/sample-creatives/expired-link.svg",
    title: "Spring colors are here",
    // Its image link has expired, so the card shows this text instead.
    body: "Fresh shades for longer days, in every bag we make.",
    cta: "SHOP_NOW",
    reach: 0.3,
    format: "image",
  },
  {
    id: "crv-08",
    campaign: "cmp-2001",
    source_system: "google_ads",
    image: null,
    title: "Official store – free shipping",
    body: "Shop the full collection direct, with free shipping on every order.",
    cta: null,
    reach: 0.7,
    format: "text",
  },
  {
    id: "crv-09",
    campaign: "cmp-3001",
    source_system: "tiktok_ads",
    image: null,
    title: "Creator unboxing",
    body: "Watch a creator unpack the tote and pack it for a weekend away.",
    cta: "SHOP_NOW",
    reach: 0.5,
    format: "video",
  },
];

/** A new creative launches every FLIGHT_EVERY days from FLIGHT_EPOCH and runs FLIGHT_DAYS. */
const FLIGHT_EPOCH = "2025-01-06";
const FLIGHT_EVERY = 10;
const FLIGHT_DAYS = 42;
const FLIGHT_FORMATS = ["video", "image", "carousel", "video", "flexible"] as const;
const FLIGHT_HOOKS = [
  ["Founder story: why we started", "Two friends, one tote and a kitchen table. Here is how it began."],
  ["3 ways to wear the linen set", "Office, weekend, vacation: one set, three looks in fifteen seconds."],
  ["POV: your first order arrives", "The box, the tissue, the first wear. Free shipping over $50."],
  ["Packed in 15 seconds", "Everything you need for a weekend away, in one bag."],
  ["Before and after: the closet edit", "Fewer, better pieces. See the swap one customer made."],
  ["Reviews read aloud", "Real customers, real words. Rated 4.8 by 12,000 buyers."],
  ["The gift guide", "Something for everyone on your list, wrapped and shipped in two days."],
  ["Behind the seams", "Every stitch finished by hand in our workshop."],
] as const;

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** The flights that run on any day from `from` to `to`. */
function flights(from: string, to: string): SampleCreative[] {
  const first = Math.max(0, Math.floor((daysBetween(FLIGHT_EPOCH, from) - FLIGHT_DAYS) / FLIGHT_EVERY) + 1);
  const last = Math.floor(daysBetween(FLIGHT_EPOCH, to) / FLIGHT_EVERY);
  const result: SampleCreative[] = [];
  for (let index = first; index <= last; index++) {
    const launch = addDays(FLIGHT_EPOCH, index * FLIGHT_EVERY);
    const tiktok = index % 3 === 2;
    const [title, body] = FLIGHT_HOOKS[index % FLIGHT_HOOKS.length] ?? FLIGHT_HOOKS[0];
    result.push({
      id: `crv-f${index}`,
      campaign: tiktok ? "cmp-3001" : "cmp-1003",
      source_system: tiktok ? "tiktok_ads" : "meta_ads",
      // Each hook has its own artwork, so a recurring hook reads as the same creative idea.
      image: `/sample-creatives/flight-0${(index % FLIGHT_HOOKS.length) + 1}.svg`,
      title,
      body,
      cta: "SHOP_NOW",
      reach: 0.45 + (index % 4) * 0.1,
      format: FLIGHT_FORMATS[index % FLIGHT_FORMATS.length] ?? "video",
      flight: { from: launch, to: addDays(launch, FLIGHT_DAYS - 1) },
    });
  }
  return result;
}

/** The ads a creative runs in, by campaign and names, each with its pull there. */
function placements(creative: SampleCreative): { campaign: string; weight: number; names: AdNames }[] {
  // The first asset runs in both prospecting ads and in retargeting, so name filtering must scope its
  // metrics as well as its card.
  const all =
    creative.id === "crv-01"
      ? [
          { campaign: creative.campaign, weight: 0.75, variant: 0 },
          { campaign: creative.campaign, weight: 0.75, variant: 1 },
          { campaign: "cmp-1002", weight: 0.25, variant: 1 },
        ]
      : [{ campaign: creative.campaign, weight: 1, variant: Number(creative.id.slice(-1)) % 2 }];
  return all.map(({ campaign, weight, variant }) => ({ campaign, weight, names: sampleAdNames(campaign, variant) }));
}

/** Whether a row or placement is in the page's platform, campaign and name scope. */
function inScope(filters: CreativesFilters, row: { source_system: string; campaign: string; names: AdNames }) {
  return (
    (!filters.channel || row.source_system === filters.channel) &&
    (!filters.campaign || row.campaign === filters.campaign) &&
    matchesAdNames(row.names, filters.names)
  );
}

type Day = { spendCents: bigint; impressions: bigint; clicks: bigint; conversions: number; revenue: number };
type Share = { delivery: number; conversion: number };

/** A creative's pull on one day of an ad it runs in, or null off its flight. Flights ramp up for a week, then tire. */
function share(storeId: string, creative: SampleCreative, date: string, weight: number): Share | null {
  let reach = creative.reach * weight;
  let conversionRate = 1;
  if (creative.flight) {
    if (date < creative.flight.from || date > creative.flight.to) return null;
    const age = daysBetween(creative.flight.from, date);
    reach *= Math.min(1, (age + 1) / 7) * (age > 21 ? Math.max(0.35, 1 - (age - 21) / 30) : 1);
    conversionRate = age > 14 ? Math.max(0.55, 1 - (age - 14) / 40) : 1.15;
  }
  const random = seededRandom(`creative|${storeId}|${creative.id}|${date}`);
  const delivery = reach * (0.7 + random() * 0.6);
  return { delivery, conversion: delivery * conversionRate * (0.8 + random() * 0.4) };
}

/** Running fractions of `weights`, the last exactly 1, so slices of a total between them sum to it. */
function runningShares(weights: number[]): number[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let running = 0;
  return weights.map((weight, index) => (index === weights.length - 1 ? 1 : (running += weight) / total));
}

/** One ad's day split across the creatives that ran in it; whole units go by running shares, so nothing is lost. */
function split(row: PaidSourceRow, running: { creative: SampleCreative; share: Share }[]) {
  const delivery = runningShares(running.map((item) => item.share.delivery));
  const conversion = runningShares(running.map((item) => item.share.conversion));
  const units = (total: bigint, from: number, to: number) =>
    BigInt(Math.floor(Number(total) * to) - Math.floor(Number(total) * from));
  return running.map(({ creative }, index) => {
    const [from, to] = [delivery[index - 1] ?? 0, delivery[index] ?? 1];
    const converted = (conversion[index] ?? 1) - (conversion[index - 1] ?? 0);
    const day: Day = {
      spendCents: units(row.spendCents, from, to),
      impressions: units(row.impressions, from, to),
      clicks: units(row.clicks, from, to),
      conversions: row.conversions * converted,
      revenue: row.platformRevenue * converted,
    };
    return { creative, day };
  });
}

/** One ad's day, or one creative's part of it: a live rpt_ad_performance_daily row. */
type CreativeDay = {
  creative: SampleCreative | null;
  source_system: string;
  campaign: string;
  names: AdNames;
  date: string;
  day: Day;
};

/**
 * The sample ad delivery over `range`, each ad's day split across the creatives
 * of `creatives` that ran in it, before any filter, so a filter only removes
 * rows. A day no creative ran stays whole, with no creative, as live rows
 * without an ad_creative_id do.
 */
function creativeDelivery(storeId: string, range: DateRange, creatives: readonly SampleCreative[]): CreativeDay[] {
  const key = (campaign: string, names: AdNames) => `${campaign}|${JSON.stringify(names)}`;
  const byAd = new Map<string, { creative: SampleCreative; weight: number }[]>();
  for (const creative of creatives)
    for (const { campaign, weight, names } of placements(creative))
      byAd.set(key(campaign, names), [...(byAd.get(key(campaign, names)) ?? []), { creative, weight }]);
  return samplePaidSource(storeId, range).flatMap((row): CreativeDay[] => {
    const base = { source_system: row.source_system, campaign: row.campaign.id, names: row.names, date: row.date };
    const running = (byAd.get(key(row.campaign.id, row.names)) ?? []).flatMap(({ creative, weight }) => {
      const pull = share(storeId, creative, row.date, weight);
      return pull ? [{ creative, share: pull }] : [];
    });
    if (!running.length) {
      const { spendCents, impressions, clicks, conversions, platformRevenue: revenue } = row;
      return [{ ...base, creative: null, day: { spendCents, impressions, clicks, conversions, revenue } }];
    }
    return split(row, running).map((part) => ({ ...base, ...part }));
  });
}

type Sums = Day & { latest: string };
type Periods = [Sums | null, Sums | null, Sums | null];
/** One live `grouped` row: a creative on its platform, or (creative null) a platform's delivery with no creative. */
type Grouped<C extends SampleCreative | null = SampleCreative | null> = {
  creative: C;
  channel: string;
  periods: Periods;
  firstDate: string | null;
};

/**
 * The live `grouped` CTE's rows in scope, summed over the selected and
 * comparison periods: each creative, and each platform's delivery that no
 * creative ran.
 */
function grouped(
  filters: CreativesFilters,
  baselines: BaselineRanges,
): { creatives: Grouped<SampleCreative>[]; uncovered: Grouped<null>[] } {
  if (!SAMPLE_STORE_SCALE.has(filters.storeId)) return { creatives: [], uncovered: [] };
  const ranges: (DateRange | null)[] = [filters.range, baselines[0], baselines[1]];
  const dates = ranges.flatMap((range) => (range ? [range.from, range.to] : [])).sort();
  const lookback = lookbackStart(filters.range.from);
  const all = [...EVERGREEN, ...flights(dates[0] ?? filters.range.from, dates.at(-1) ?? filters.range.to)];
  const sums = new Map<SampleCreative | string, Periods>();
  ranges.forEach((range, slot) => {
    if (!range) return;
    for (const row of creativeDelivery(filters.storeId, range, all)) {
      // No creative means no format, so a format scope leaves that delivery out, as live.
      if (!inScope(filters, row) || (filters.format && row.creative?.format !== filters.format)) continue;
      const group = row.creative ?? row.source_system;
      const periods = sums.get(group) ?? [null, null, null];
      const before = periods[slot];
      periods[slot] = {
        spendCents: (before?.spendCents ?? 0n) + row.day.spendCents,
        impressions: (before?.impressions ?? 0n) + row.day.impressions,
        clicks: (before?.clicks ?? 0n) + row.day.clicks,
        conversions: (before?.conversions ?? 0) + row.day.conversions,
        revenue: (before?.revenue ?? 0) + row.day.revenue,
        latest: before && before.latest > row.date ? before.latest : row.date,
      };
      sums.set(group, periods);
    }
  });
  const creatives = all.flatMap((creative) => {
    const periods = sums.get(creative);
    if (!periods) return [];
    // Launches ignore campaign and name filters: a creative launches once, wherever it runs.
    const start = creative.flight ? creative.flight.from : lookback;
    const firstDate = start > filters.range.to ? null : start < lookback ? lookback : start;
    return [{ creative, channel: creative.source_system, periods, firstDate }];
  });
  const uncovered = [...sums].flatMap(([group, periods]) =>
    typeof group === "string" ? [{ creative: null, channel: group, periods, firstDate: null }] : [],
  );
  return { creatives, uncovered };
}

const ratio = (numerator: number, denominator: number) => (denominator === 0 ? null : String(numerator / denominator));

/** One period's sums in BigQuery's wire format, under the column names `prefix` gives them. */
function wireSums(sums: Sums | null, prefix: PeriodPrefix) {
  return {
    [`${prefix}spend`]: sums ? fromUnits(sums.spendCents * 10_000_000n) : null,
    [`${prefix}impressions`]: sums ? String(sums.impressions) : null,
    [`${prefix}clicks`]: sums ? String(sums.clicks) : null,
    [`${prefix}conversions`]: sums ? String(sums.conversions) : null,
    [`${prefix}revenue`]: sums ? String(sums.revenue) : null,
  };
}

/** The ratios the live query computes from those sums. */
function wireRatios(sums: Sums | null, prefix: PeriodPrefix) {
  const spend = sums ? Number(sums.spendCents) / 100 : 0;
  return {
    [`${prefix}roas`]: sums ? ratio(sums.revenue, spend) : null,
    [`${prefix}cpo`]: sums ? ratio(spend, sums.conversions) : null,
    [`${prefix}ctr`]: sums ? ratio(Number(sums.clicks), Number(sums.impressions)) : null,
  };
}

function coverage(groups: Grouped[]) {
  const latest = (slot: 0 | 1 | 2) =>
    groups.reduce<string | null>((max, group) => {
      const date = group.periods[slot]?.latest ?? null;
      return date !== null && (max === null || date > max) ? date : max;
    }, null);
  return { latest_date: latest(0), previous_latest_date: latest(1), second_latest_date: latest(2) };
}

function sortValue(row: Record<string, string | null>, sort: CreativeSort): number | null {
  const value = row[sort];
  if (value === null || value === undefined) return null;
  return sort === "spend" ? Number(toUnits(value)) : Number(value);
}

export async function sampleCreatives(filters: CreativesFilters, baselines: BaselineRanges): Promise<CreativesData> {
  // As live: coverage spans every creative in scope, before the selection or minimums keep some.
  const groups = grouped(filters, baselines).creatives;
  const covered = coverage(groups);
  const { selection } = filters;
  const rows = groups
    .filter(
      ({ creative }) => !selection || selection.some(([c, id]) => c === creative.source_system && id === creative.id),
    )
    .map(({ creative, periods, firstDate }) => ({
      creative_id: creative.id,
      title: creative.title,
      body: creative.body,
      name: null,
      image_url: creative.image,
      thumbnail_url: null,
      video_url: sampleClip(creative.id),
      call_to_action: creative.cta,
      channel: creative.source_system,
      format: creative.format,
      post_url: null,
      ad_url: null,
      first_date: firstDate,
      ...Object.assign({}, ...PERIOD_PREFIXES.map((prefix, slot) => wireSums(periods[slot] ?? null, prefix))),
      ...Object.assign({}, ...PERIOD_PREFIXES.map((prefix, slot) => wireRatios(periods[slot] ?? null, prefix))),
      ...covered,
    }))
    .filter(
      (row) =>
        row.spend !== null &&
        (!filters.minimumSpend || toUnits(row.spend) >= toUnits(filters.minimumSpend)) &&
        (!filters.minimumConversions || Number(row.conversions ?? 0) >= Number(filters.minimumConversions)),
    );
  const ascending = filters.sort === "cpo";
  rows.sort((a, b) => {
    const left = sortValue(a, filters.sort);
    const right = sortValue(b, filters.sort);
    // NULLS LAST in either direction, then the live query's tie-breakers.
    if (left !== right) {
      if (left === null) return 1;
      if (right === null) return -1;
      return ascending ? left - right : right - left;
    }
    return a.creative_id.localeCompare(b.creative_id) || a.channel.localeCompare(b.channel);
  });
  const limit = filters.selection ? 4 : MAX_CREATIVES;
  return {
    creatives: decodeRows(CreativeRow, rows.slice(0, limit), CREATIVE_RELATION).map((row) =>
      toCreative(
        row,
        filters.range,
        "available",
        row.format === "carousel" ? [{ kind: "image", src: carouselDetail }] : [],
      ),
    ),
    truncated: rows.length > limit,
    coverage: rows.length ? covered : null,
  };
}

/**
 * The live summary's groupings over the same rows: with and without a creative,
 * the totals, each format and each launch week.
 */
export async function sampleCreativeSummary(
  filters: CreativesFilters,
  baselines: BaselineRanges,
): Promise<CreativeSummary> {
  const { creatives, uncovered } = grouped(filters, baselines);
  const launchWeek = (group: Grouped) => {
    const first = firstSpend(group.firstDate, filters.range.from);
    return first?.when === "launched" ? periodStart(first.date, "week") : null;
  };

  const total = (
    members: Grouped[],
    key: { kind: string; format: string | null; launch_week: string | null },
    hasCreative: boolean,
  ) => {
    const covered = coverage(members);
    const sum = (slot: 0 | 1 | 2) => {
      const present = members.map((group) => group.periods[slot]).filter((sums) => sums !== null);
      return present.length
        ? present.reduce<Sums>(
            (acc, sums) => ({
              spendCents: acc.spendCents + sums.spendCents,
              impressions: acc.impressions + sums.impressions,
              clicks: acc.clicks + sums.clicks,
              conversions: acc.conversions + sums.conversions,
              revenue: acc.revenue + sums.revenue,
              latest: sums.latest > acc.latest ? sums.latest : acc.latest,
            }),
            { spendCents: 0n, impressions: 0n, clicks: 0n, conversions: 0, revenue: 0, latest: "" },
          )
        : null;
    };
    const count = (slot: 0 | 1 | 2) =>
      String(members.filter((group) => (group.periods[slot]?.spendCents ?? 0n) > 0n).length);
    return {
      ...key,
      has_creative: String(hasCreative),
      ...Object.assign({}, ...PERIOD_PREFIXES.map((prefix, slot) => wireSums(sum(slot as 0 | 1 | 2), prefix))),
      creatives: count(0),
      previous_creatives: count(1),
      second_creatives: count(2),
      new_creatives: String(
        members.filter((group) => launchWeek(group) !== null && (group.periods[0]?.spendCents ?? 0n) > 0n).length,
      ),
      ...covered,
    };
  };
  const by = <K extends string | null>(members: Grouped[], key: (group: Grouped) => K) => {
    const map = new Map<K, Grouped[]>();
    for (const group of members) map.set(key(group), [...(map.get(key(group)) ?? []), group]);
    return [...map.entries()];
  };
  const rows = [
    { members: creatives, hasCreative: true },
    { members: uncovered, hasCreative: false },
  ].flatMap(({ members, hasCreative }) =>
    members.length
      ? [
          total(members, { kind: "total", format: null, launch_week: null }, hasCreative),
          ...by(members, (group) => group.creative?.format ?? null).map(([format, group]) =>
            total(group, { kind: "format", format, launch_week: null }, hasCreative),
          ),
          ...by(members, launchWeek).map(([week, group]) =>
            total(group, { kind: "launch", format: null, launch_week: week }, hasCreative),
          ),
        ]
      : [],
  );
  // As live: ORDER BY kind, has_creative DESC, spend DESC NULLS LAST.
  rows.sort(
    (a, b) =>
      a.kind.localeCompare(b.kind) ||
      b.has_creative.localeCompare(a.has_creative) ||
      (b.spend === null ? -1 : a.spend === null ? 1 : Number(toUnits(b.spend) - toUnits(a.spend))),
  );
  return toCreativeSummary(decodeRows(CreativeSummaryRow, rows, CREATIVE_RELATION));
}

export function sampleCreativeChannels(filters: ReportFilters): string[] {
  return SAMPLE_STORE_SCALE.get(filters.storeId)
    ? [...new Set(EVERGREEN.map((creative) => creative.source_system))].sort()
    : [];
}

export function sampleCreativeNames(filters: CreativesFilters) {
  if (!SAMPLE_STORE_SCALE.has(filters.storeId)) return { rows: [], truncated: false };
  return sampleNameMatches(
    [...EVERGREEN, ...flights(filters.range.from, filters.range.to)].flatMap((creative) =>
      placements(creative)
        .filter((placement) => inScope(filters, { ...placement, source_system: creative.source_system }))
        .map((placement) => placement.names),
    ),
  );
}

const sampleClip = (id: string) => (id === "crv-03" ? "/sample-creatives/creative-03.mp4" : null);
const carouselDetail = "/sample-creatives/creative-05.svg";

/** Current creative inventory includes archived flights, regardless of their spend in a report period. */
export function sampleCreativeAssets(filters: AssetScope, today: string) {
  const rows: CreativeAsset[] = [];
  if (SAMPLE_STORE_SCALE.has(filters.storeId)) {
    for (const c of [...EVERGREEN, ...flights(FLIGHT_EPOCH, today)]) {
      if ((filters.entity && filters.entity !== c.id) || (filters.channel && filters.channel !== c.source_system))
        continue;
      const add = (role: string, values: Partial<CreativeAsset>, variant = 0) => {
        const key = `${c.id}-${role}-${variant}`;
        if ((filters.role && filters.role !== role) || key <= filters.cursor) return;
        rows.push({
          sm_ad_creative_asset_key: key,
          source_system: c.source_system,
          ad_creative_id: c.id,
          ad_id: null,
          ad_campaign_id: c.campaign,
          asset_role: role,
          asset_pinned_position: null,
          asset_performance_label: null,
          asset_status: null,
          asset_id: null,
          asset_text: null,
          asset_video_id: null,
          asset_image_url: null,
          asset_video_url: null,
          asset_link_url: null,
          ...values,
        });
      };
      add("title", { asset_text: c.title, asset_pinned_position: c.id === "crv-03" ? "HEADLINE_1" : null });
      add("body", { asset_text: c.body });
      if (c.cta) add("call_to_action", { asset_text: c.cta });
      if (c.format === "video")
        add("video", {
          asset_video_id: c.id + "-video",
          asset_image_url: c.image,
          asset_video_url: sampleClip(c.id),
        });
      else if (c.image) add("image", { asset_image_url: c.image });
      if (c.format === "carousel") add("image", { asset_image_url: carouselDetail }, 1);
    }
  }
  rows.sort((a, b) => (a.sm_ad_creative_asset_key < b.sm_ad_creative_asset_key ? -1 : 1));
  return { rows: rows.slice(0, ASSET_PAGE_SIZE), truncated: rows.length > ASSET_PAGE_SIZE };
}
