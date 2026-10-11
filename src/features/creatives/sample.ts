/**
 * Creatives, sample. Synthetic creatives with local placeholder images, a
 * few text-only cards (as non-Meta platforms render), and one image that
 * fails to load, so the text fallback is visible from the first run. No
 * external image host is referenced.
 */
import { decodeRows } from "@/lib/data/decode";
import { fromUnits, toUnits } from "@/lib/data/decimal";
import { datesInRange, type ReportFilters } from "@/lib/filters";
import { seededRandom } from "@/lib/sample/random";
import { SAMPLE_STORE_SCALE } from "@/lib/sample/stores";
import { sampleAdNames } from "@/lib/sample/ad-names";
import { matchesAdNames, sampleNameMatches } from "@/lib/ad-name-filters";
import type { CreativeSort, CreativesData, CreativesFilters } from "./queries";
import { CREATIVE_RELATION, CreativeRow, MAX_CREATIVES, toCreative } from "./rows";

const CREATIVES = [
  {
    id: "crv-01",
    campaign: "cmp-1001",
    channel: "Meta",
    image: "/sample-creatives/creative-01.svg",
    title: "Meet the everyday tote",
    body: "Built for the commute, the market, and everything after. Free returns, always.",
    cta: "SHOP_NOW",
    reach: 1,
  },
  {
    id: "crv-02",
    campaign: "cmp-1001",
    channel: "Meta",
    image: "/sample-creatives/creative-02.svg",
    title: "Back in stock: the linen set",
    body: "Our most-requested set is back in four colors. Restocks sell out fast.",
    cta: "SHOP_NOW",
    reach: 0.8,
  },
  {
    id: "crv-03",
    campaign: "cmp-1002",
    channel: "Meta",
    image: "/sample-creatives/creative-03.svg",
    title: "Customers on repeat",
    body: "“I bought one and came back for three more.” See why reviewers call it a staple.",
    cta: "LEARN_MORE",
    reach: 0.65,
  },
  {
    id: "crv-04",
    campaign: "cmp-1002",
    channel: "Meta",
    image: "/sample-creatives/creative-04.svg",
    title: "Weekend sale: 20% off",
    body: "Two days only. The whole collection, no code needed.",
    cta: "SHOP_NOW",
    reach: 0.55,
  },
  {
    id: "crv-05",
    campaign: "cmp-1003",
    channel: "Meta",
    image: "/sample-creatives/creative-05.svg",
    title: "Gift it this season",
    body: "Wrapped, tagged, and shipped in two days.",
    cta: "SHOP_NOW",
    reach: 0.4,
  },
  {
    id: "crv-06",
    campaign: "cmp-1003",
    channel: "Meta",
    image: "/sample-creatives/creative-06.svg",
    title: "How it's made",
    body: "A two-minute look inside the workshop where every piece is finished by hand.",
    cta: "WATCH_MORE",
    reach: 0.35,
  },
  {
    id: "crv-07",
    campaign: "cmp-1001",
    channel: "Meta",
    image: "/sample-creatives/expired-link.svg",
    title: "Spring colors are here",
    body: "Fresh shades for longer days. This card's image link has expired, so the text shows instead.",
    cta: "SHOP_NOW",
    reach: 0.3,
  },
  {
    id: "crv-08",
    campaign: "cmp-2001",
    channel: "Google",
    image: null,
    title: "Official store – free shipping",
    body: "Shop the full collection direct, with free shipping on every order.",
    cta: null,
    reach: 0.7,
  },
  {
    id: "crv-09",
    campaign: "cmp-3001",
    channel: "TikTok",
    image: null,
    title: "Creator unboxing",
    body: "Watch a creator unpack the tote and pack it for a weekend away.",
    cta: "SHOP_NOW",
    reach: 0.5,
  },
] as const;

function placements(creative: (typeof CREATIVES)[number], filters: CreativesFilters) {
  if (filters.channel && creative.channel !== filters.channel) return [];
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

export async function sampleCreatives(filters: CreativesFilters): Promise<CreativesData> {
  const scale = SAMPLE_STORE_SCALE.get(filters.storeId);
  if (!scale) return { creatives: [], truncated: false };
  const dates = datesInRange(filters.range);
  const rows = CREATIVES.flatMap((creative) => {
    const selected = placements(creative, filters);
    if (!selected.length) return [];
    let spendCents = 0n;
    let impressions = 0n;
    let clicks = 0n;
    let conversions = 0;
    for (const placement of selected)
      for (const date of dates) {
        const random = seededRandom(`creative|${filters.storeId}|${creative.id}|${date}`);
        const dayImpressions = Math.round(18_000 * scale * creative.reach * placement.weight * (0.7 + random() * 0.6));
        const dayClicks = Math.round(dayImpressions * (0.005 + random() * 0.015));
        spendCents += BigInt(Math.round((dayImpressions / 1000) * 1150 * (0.85 + random() * 0.3)));
        impressions += BigInt(dayImpressions);
        clicks += BigInt(dayClicks);
        conversions += Math.round(dayClicks * (0.02 + random() * 0.04) * 4) / 4;
      }
    return [
      {
        creative_id: creative.id,
        title: creative.title,
        body: creative.body,
        image_url: creative.image,
        thumbnail_url: null,
        call_to_action: creative.cta,
        channel: creative.channel,
        spend: fromUnits(spendCents * 10_000_000n),
        impressions: String(impressions),
        clicks: String(clicks),
        conversions: String(conversions),
        revenue: String(conversions * 71),
        roas: spendCents === 0n ? null : String((conversions * 71) / (Number(spendCents) / 100)),
        cpo: conversions === 0 ? null : String(Number(spendCents) / 100 / conversions),
        ad_url: null,
        ctr: impressions === 0n ? null : String(Number(clicks) / Number(impressions)),
      },
    ];
  });

  const sortValue = (row: (typeof rows)[number], sort: CreativeSort) => {
    const value = row[sort];
    if (value === null) return sort === "cpo" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
    return sort === "spend" ? Number(toUnits(value)) : Number(value);
  };
  rows.sort(
    (a, b) =>
      (filters.sort === "cpo" ? 1 : -1) * (sortValue(a, filters.sort) - sortValue(b, filters.sort)) ||
      a.creative_id.localeCompare(b.creative_id),
  );
  return {
    creatives: decodeRows(CreativeRow, rows.slice(0, MAX_CREATIVES), CREATIVE_RELATION).map(toCreative),
    truncated: rows.length > MAX_CREATIVES,
  };
}

export function sampleCreativeChannels(filters: ReportFilters): string[] {
  return SAMPLE_STORE_SCALE.get(filters.storeId)
    ? [...new Set(CREATIVES.map((creative) => creative.channel))].sort()
    : [];
}

export function sampleCreativeNames(filters: CreativesFilters) {
  if (!SAMPLE_STORE_SCALE.has(filters.storeId)) return { rows: [], truncated: false };
  return sampleNameMatches(
    CREATIVES.flatMap((creative) => placements(creative, filters).map((placement) => placement.names)),
  );
}
