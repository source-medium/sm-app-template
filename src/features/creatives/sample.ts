/**
 * Creatives, sample. Nine evergreen creatives with local placeholder images,
 * a few text-only cards, and one image that fails to load, so the text
 * fallback is visible from the first run; plus a new creative launching every
 * ten days that ramps up and then tires, so launches, formats and period
 * changes have something to show. Every value depends only on the store, the
 * creative and the date, so any period reads the same day the same way. No
 * external image host is referenced.
 */
import { decodeRows } from "@/lib/data/decode";
import { fromUnits, toUnits } from "@/lib/data/decimal";
import { addDays, datesInRange, type DateRange, type ReportFilters } from "@/lib/filters";
import type { BaselineRanges } from "@/lib/comparison";
import { seededRandom } from "@/lib/sample/random";
import { SAMPLE_STORE_SCALE } from "@/lib/sample/stores";
import { sampleAdNames, sampleNameMatches } from "@/lib/sample/ad-names";
import { matchesAdNames } from "@/lib/ad-name-filters";
import { periodStart } from "@/lib/time-grain";
import type { CreativeSummary, CreativesData, CreativesFilters } from "./queries";
import type { CreativeSort } from "./filters";
import {
  CREATIVE_RELATION,
  CreativeRow,
  CreativeSummaryRow,
  LAUNCH_LOOKBACK_DAYS,
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

function placements(creative: SampleCreative, filters: CreativesFilters) {
  if (filters.channel && creative.source_system !== filters.channel) return [];
  // The first asset runs in two campaigns, so name filtering must scope its metrics as well as its card.
  const all =
    creative.id === "crv-01"
      ? [
          { campaign: creative.campaign, weight: 0.75, variant: 0 },
          { campaign: "cmp-1002", weight: 0.25, variant: 1 },
        ]
      : [{ campaign: creative.campaign, weight: 1, variant: Number(creative.id.slice(-1)) % 2 }];
  return all
    .map((placement) => ({ ...placement, names: sampleAdNames(placement.campaign, placement.variant) }))
    .filter(
      (placement) =>
        (!filters.campaign || placement.campaign === filters.campaign) &&
        matchesAdNames(placement.names, filters.names),
    );
}

type Day = { spendCents: bigint; impressions: bigint; clicks: bigint; conversions: number };

/** One creative's delivery on one day, or null when it did not run. Flights ramp up for a week, then tire. */
function day(storeId: string, scale: number, creative: SampleCreative, date: string, weight: number): Day | null {
  let reach = creative.reach * weight;
  let conversionRate = 1;
  if (creative.flight) {
    if (date < creative.flight.from || date > creative.flight.to) return null;
    const age = daysBetween(creative.flight.from, date);
    reach *= Math.min(1, (age + 1) / 7) * (age > 21 ? Math.max(0.35, 1 - (age - 21) / 30) : 1);
    conversionRate = age > 14 ? Math.max(0.55, 1 - (age - 14) / 40) : 1.15;
  }
  const random = seededRandom(`creative|${storeId}|${creative.id}|${date}`);
  const impressions = Math.round(18_000 * scale * reach * (0.7 + random() * 0.6));
  const clicks = Math.round(impressions * (0.005 + random() * 0.015));
  return {
    spendCents: BigInt(Math.round((impressions / 1000) * 1150 * (0.85 + random() * 0.3))),
    impressions: BigInt(impressions),
    clicks: BigInt(clicks),
    conversions: Math.round(clicks * (0.02 + random() * 0.04) * conversionRate * 4) / 4,
  };
}

type Sums = Day & { latest: string };
type Grouped = { creative: SampleCreative; periods: [Sums | null, Sums | null, Sums | null]; firstDate: string | null };

/** Each creative in scope, summed over the selected and comparison periods, as the live `grouped` CTE does. */
function grouped(filters: CreativesFilters, baselines: BaselineRanges): Grouped[] {
  const scale = SAMPLE_STORE_SCALE.get(filters.storeId);
  if (!scale) return [];
  const ranges: (DateRange | null)[] = [filters.range, baselines[0], baselines[1]];
  const dates = ranges.flatMap((range) => (range ? [range.from, range.to] : [])).sort();
  const lookback = addDays(filters.range.from, -LAUNCH_LOOKBACK_DAYS);
  const all = [...EVERGREEN, ...flights(dates[0] ?? filters.range.from, dates.at(-1) ?? filters.range.to)];
  return all.flatMap((creative) => {
    if (filters.format && creative.format !== filters.format) return [];
    if (filters.selection && !filters.selection.some(([c, id]) => c === creative.source_system && id === creative.id))
      return [];
    const selected = placements(creative, filters);
    if (!selected.length) return [];
    const periods = ranges.map((range) => {
      if (!range) return null;
      let sums: Sums | null = null;
      for (const date of datesInRange(range))
        for (const placement of selected) {
          const delivery = day(filters.storeId, scale, creative, date, placement.weight);
          if (!delivery) continue;
          sums ??= { spendCents: 0n, impressions: 0n, clicks: 0n, conversions: 0, latest: date };
          sums.spendCents += delivery.spendCents;
          sums.impressions += delivery.impressions;
          sums.clicks += delivery.clicks;
          sums.conversions += delivery.conversions;
          sums.latest = date;
        }
      return sums;
    }) as Grouped["periods"];
    if (periods.every((sums) => sums === null)) return [];
    // Launches ignore campaign and name filters: a creative launches once, wherever it runs.
    const start = creative.flight ? creative.flight.from : lookback;
    const firstDate = start > filters.range.to ? null : start < lookback ? lookback : start;
    return [{ creative, periods, firstDate }];
  });
}

const ratio = (numerator: number, denominator: number) => (denominator === 0 ? null : String(numerator / denominator));

type Prefix = "" | "previous_" | "second_";
/** The sample's platform revenue per conversion. */
const ORDER_VALUE = 71;

/** One period's sums in BigQuery's wire format, under the column names `prefix` gives them. */
function wireSums(sums: Sums | null, prefix: Prefix) {
  return {
    [`${prefix}spend`]: sums ? fromUnits(sums.spendCents * 10_000_000n) : null,
    [`${prefix}impressions`]: sums ? String(sums.impressions) : null,
    [`${prefix}clicks`]: sums ? String(sums.clicks) : null,
    [`${prefix}conversions`]: sums ? String(sums.conversions) : null,
    [`${prefix}revenue`]: sums ? String(sums.conversions * ORDER_VALUE) : null,
  };
}

/** The ratios the live query computes from those sums. */
function wireRatios(sums: Sums | null, prefix: Prefix) {
  const spend = sums ? Number(sums.spendCents) / 100 : 0;
  return {
    [`${prefix}roas`]: sums ? ratio(sums.conversions * ORDER_VALUE, spend) : null,
    [`${prefix}cpo`]: sums ? ratio(spend, sums.conversions) : null,
    [`${prefix}ctr`]: sums ? ratio(Number(sums.clicks), Number(sums.impressions)) : null,
  };
}

const PREFIXES = ["", "previous_", "second_"] as const;

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
  const groups = grouped(filters, baselines);
  const covered = coverage(groups);
  const rows = groups
    .map(({ creative, periods, firstDate }) => ({
      creative_id: creative.id,
      title: creative.title,
      body: creative.body,
      name: null,
      image_url: creative.image,
      thumbnail_url: null,
      call_to_action: creative.cta,
      channel: creative.source_system,
      format: creative.format,
      post_url: null,
      ad_url: null,
      first_date: firstDate,
      ...Object.assign({}, ...PREFIXES.map((prefix, slot) => wireSums(periods[slot] ?? null, prefix))),
      ...Object.assign({}, ...PREFIXES.map((prefix, slot) => wireRatios(periods[slot] ?? null, prefix))),
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
      toCreative(row, filters.range),
    ),
    truncated: rows.length > limit,
    coverage: rows.length ? covered : null,
  };
}

/** The live summary's groupings over the same creatives: totals, each format and each launch week. */
export async function sampleCreativeSummary(
  filters: CreativesFilters,
  baselines: BaselineRanges,
): Promise<CreativeSummary> {
  const groups = grouped({ ...filters, selection: undefined }, baselines);
  if (!groups.length) return toCreativeSummary([]);
  const covered = coverage(groups);
  const launchWeek = (group: Grouped) =>
    group.firstDate !== null && group.firstDate >= filters.range.from ? periodStart(group.firstDate, "week") : null;

  const total = (members: Grouped[], key: { kind: string; format: string | null; launch_week: string | null }) => {
    const sum = (slot: 0 | 1 | 2) => {
      const present = members.map((group) => group.periods[slot]).filter((sums) => sums !== null);
      return present.length
        ? present.reduce<Sums>(
            (acc, sums) => ({
              spendCents: acc.spendCents + sums.spendCents,
              impressions: acc.impressions + sums.impressions,
              clicks: acc.clicks + sums.clicks,
              conversions: acc.conversions + sums.conversions,
              latest: sums.latest > acc.latest ? sums.latest : acc.latest,
            }),
            { spendCents: 0n, impressions: 0n, clicks: 0n, conversions: 0, latest: "" },
          )
        : null;
    };
    const count = (slot: 0 | 1 | 2) =>
      String(members.filter((group) => (group.periods[slot]?.spendCents ?? 0n) > 0n).length);
    return {
      ...key,
      has_creative: "true",
      ...Object.assign({}, ...PREFIXES.map((prefix, slot) => wireSums(sum(slot as 0 | 1 | 2), prefix))),
      creatives: count(0),
      previous_creatives: count(1),
      second_creatives: count(2),
      new_creatives: String(
        members.filter((group) => launchWeek(group) !== null && (group.periods[0]?.spendCents ?? 0n) > 0n).length,
      ),
      latest_date: covered.latest_date,
      previous_latest_date: covered.previous_latest_date,
      second_latest_date: covered.second_latest_date,
    };
  };
  const by = <K extends string | null>(key: (group: Grouped) => K) => {
    const map = new Map<K, Grouped[]>();
    for (const group of groups) map.set(key(group), [...(map.get(key(group)) ?? []), group]);
    return [...map.entries()];
  };
  const rows = [
    total(groups, { kind: "total", format: null, launch_week: null }),
    ...by((group) => group.creative.format).map(([format, members]) =>
      total(members, { kind: "format", format, launch_week: null }),
    ),
    ...by(launchWeek).map(([week, members]) => total(members, { kind: "launch", format: null, launch_week: week })),
  ].sort(
    (a, b) =>
      a.kind.localeCompare(b.kind) ||
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
      placements(creative, filters).map((placement) => placement.names),
    ),
  );
}
