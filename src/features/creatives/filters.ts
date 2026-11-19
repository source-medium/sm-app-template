import { parseAdNameFilters } from "@/lib/ad-name-filters";
import { parseChoice, single, type SearchParams } from "@/lib/filters";

export const CREATIVE_SORTS = [
  "spend",
  "impressions",
  "clicks",
  "conversions",
  "ctr",
  "revenue",
  "roas",
  "cpo",
] as const;
export type CreativeSort = (typeof CREATIVE_SORTS)[number];
/**
 * rpt_ad_performance_daily.ad_creative_format's published vocabulary, in the
 * order the report lists it. A creative with no format reads as unknown.
 */
export const CREATIVE_FORMATS = [
  { value: "video", label: "Video" },
  { value: "image", label: "Image" },
  { value: "carousel", label: "Carousel" },
  { value: "collection", label: "Collection" },
  { value: "flexible", label: "Flexible" },
  { value: "product", label: "Product feed" },
  { value: "text", label: "Text" },
  { value: "other", label: "Other" },
] as const;
export type CreativeFormat = (typeof CREATIVE_FORMATS)[number]["value"];
/** How the report names a stored format: a known one in words, anything else as stored. */
export function creativeFormatLabel(value: string | null): string {
  if (value === null) return "Unknown format";
  return CREATIVE_FORMATS.find((format) => format.value === value)?.label ?? value;
}
export type CreativeIdentity = readonly [platform: string, creativeId: string];
export function parseCreativeThreshold(value: string | undefined): string | null {
  if (!value) return null;
  return /^(?:0|[1-9]\d{0,28})(?:\.\d{1,9})?$/.test(value) ? value : null;
}
export function parseCreativeSelection(params: SearchParams): { items: CreativeIdentity[]; error: string | null } {
  const raw = single(params, "selection");
  if (!raw) return { items: [], error: null };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      !Array.isArray(parsed) ||
      parsed.length > 4 ||
      !parsed.every(
        (item) =>
          Array.isArray(item) &&
          item.length === 2 &&
          item.every((part) => typeof part === "string" && part.length > 0 && part.length <= 200),
      )
    )
      throw new Error();
    const items = parsed as CreativeIdentity[];
    if (new Set(items.map((item) => JSON.stringify(item))).size !== items.length) throw new Error();
    return { items, error: null };
  } catch {
    return { items: [], error: "Choose up to four distinct creatives to compare. Clear the selection to start again." };
  }
}

/** Applied data options for the report; the view only changes presentation. */
export function creativesOptions(params: SearchParams) {
  const minimumSpend = parseCreativeThreshold(single(params, "min_spend"));
  const minimumConversions = parseCreativeThreshold(single(params, "min_conversions"));
  return {
    channel: single(params, "channel")?.slice(0, 100) || null,
    campaign: single(params, "campaign")?.slice(0, 200) || null,
    view: parseChoice(params, "view", ["delivery", "returns", "table"] as const, "returns"),
    format: parseChoice(params, "format", ["", ...CREATIVE_FORMATS.map((format) => format.value)] as const, "") || null,
    sort: parseChoice(params, "sort", CREATIVE_SORTS, "spend"),
    minimumSpend,
    minimumConversions,
    thresholdError:
      (!!single(params, "min_spend") && minimumSpend === null) ||
      (!!single(params, "min_conversions") && minimumConversions === null),
    selection: parseCreativeSelection(params),
    names: parseAdNameFilters(params),
  };
}
