/**
 * Creatives, sample. Synthetic creatives with local placeholder images, a
 * few text-only cards (as non-Meta platforms render), and one image that
 * fails to load, so the text fallback is visible from the first run. No
 * external image host is referenced.
 */
import { decodeRows } from "@/lib/data/decode";
import { fromUnits, toUnits } from "@/lib/data/decimal";
import { datesInRange } from "@/lib/filters";
import { seededRandom } from "@/lib/sample/random";
import { SAMPLE_STORE_SCALE } from "@/lib/sample/stores";
import type { CreativeSort, CreativesData, CreativesFilters } from "./queries";
import { CREATIVE_RELATION, CreativeRow, MAX_CREATIVES, toCreative } from "./rows";

const CREATIVES = [
  {
    id: "crv-01",
    channel: "Meta",
    image: "/sample-creatives/creative-01.svg",
    title: "Meet the everyday tote",
    body: "Built for the commute, the market, and everything after. Free returns, always.",
    cta: "SHOP_NOW",
    reach: 1,
  },
  {
    id: "crv-02",
    channel: "Meta",
    image: "/sample-creatives/creative-02.svg",
    title: "Back in stock: the linen set",
    body: "Our most-requested set is back in four colors. Restocks sell out fast.",
    cta: "SHOP_NOW",
    reach: 0.8,
  },
  {
    id: "crv-03",
    channel: "Meta",
    image: "/sample-creatives/creative-03.svg",
    title: "Customers on repeat",
    body: "“I bought one and came back for three more.” See why reviewers call it a staple.",
    cta: "LEARN_MORE",
    reach: 0.65,
  },
  {
    id: "crv-04",
    channel: "Meta",
    image: "/sample-creatives/creative-04.svg",
    title: "Weekend sale: 20% off",
    body: "Two days only. The whole collection, no code needed.",
    cta: "SHOP_NOW",
    reach: 0.55,
  },
  {
    id: "crv-05",
    channel: "Meta",
    image: "/sample-creatives/creative-05.svg",
    title: "Gift it this season",
    body: "Wrapped, tagged, and shipped in two days.",
    cta: "SHOP_NOW",
    reach: 0.4,
  },
  {
    id: "crv-06",
    channel: "Meta",
    image: "/sample-creatives/creative-06.svg",
    title: "How it's made",
    body: "A two-minute look inside the workshop where every piece is finished by hand.",
    cta: "WATCH_MORE",
    reach: 0.35,
  },
  {
    id: "crv-07",
    channel: "Meta",
    image: "/sample-creatives/expired-link.svg",
    title: "Spring colors are here",
    body: "Fresh shades for longer days. This card's image link has expired, so the text shows instead.",
    cta: "SHOP_NOW",
    reach: 0.3,
  },
  {
    id: "crv-08",
    channel: "Google",
    image: null,
    title: "Official store – free shipping",
    body: "Shop the full collection direct, with free shipping on every order.",
    cta: null,
    reach: 0.7,
  },
  {
    id: "crv-09",
    channel: "TikTok",
    image: null,
    title: "Creator unboxing",
    body: "Watch a creator unpack the tote and pack it for a weekend away.",
    cta: "SHOP_NOW",
    reach: 0.5,
  },
] as const;

export async function sampleCreatives(filters: CreativesFilters): Promise<CreativesData> {
  const scale = SAMPLE_STORE_SCALE[filters.storeId] ?? 0;
  const dates = datesInRange(filters.range);
  const rows = CREATIVES.map((creative) => {
    let spendCents = 0n;
    let impressions = 0n;
    let clicks = 0n;
    let conversions = 0;
    for (const date of dates) {
      const random = seededRandom(`creative|${filters.storeId}|${creative.id}|${date}`);
      const dayImpressions = Math.round(18_000 * scale * creative.reach * (0.7 + random() * 0.6));
      const dayClicks = Math.round(dayImpressions * (0.005 + random() * 0.015));
      spendCents += BigInt(Math.round((dayImpressions / 1000) * 1150 * (0.85 + random() * 0.3)));
      impressions += BigInt(dayImpressions);
      clicks += BigInt(dayClicks);
      conversions += Math.round(dayClicks * (0.02 + random() * 0.04) * 4) / 4;
    }
    return {
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
      ctr: impressions === 0n ? null : String(Number(clicks) / Number(impressions)),
    };
  });

  const sortValue = (row: (typeof rows)[number], sort: CreativeSort) => {
    const value = row[sort];
    if (value === null) return -1;
    return sort === "spend" ? Number(toUnits(value)) : Number(value);
  };
  rows.sort(
    (a, b) => sortValue(b, filters.sort) - sortValue(a, filters.sort) || a.creative_id.localeCompare(b.creative_id),
  );
  return {
    creatives: decodeRows(CreativeRow, rows.slice(0, MAX_CREATIVES), CREATIVE_RELATION).map(toCreative),
    truncated: rows.length > MAX_CREATIVES,
  };
}
