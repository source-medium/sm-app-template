import { z } from "zod";
import { bq } from "@/lib/data/decode";
import { safeImageUrl } from "@/lib/image-url";
import { single, withParams, type SearchParams } from "@/lib/filters";

export const ASSET_RELATION = "rpt_ad_creative_assets";
export const ASSET_PAGE_SIZE = 24;
export const assetRoles = {
  video: "Video",
  image: "Image",
  title: "Headline",
  body: "Primary text",
  description: "Description",
  logo: "Logo",
  call_to_action: "Call to action",
  website_url: "Destination",
  business_name: "Business name",
  other: "Other",
};
export function assetLabel(role: string) {
  return Object.hasOwn(assetRoles, role) ? assetRoles[role as keyof typeof assetRoles] : role;
}
// The live table contains external URLs. Same-origin paths are reserved for the bundled sample assets.
const media = bq
  .string()
  .nullable()
  .transform((value) => {
    const url = safeImageUrl(value);
    return url?.startsWith("https://") ? url : null;
  });
export const AssetRow = z.object({
  sm_ad_creative_asset_key: bq.string(),
  source_system: bq.string(),
  ad_creative_id: bq.string().nullable(),
  ad_id: bq.string().nullable(),
  ad_campaign_id: bq.string().nullable(),
  asset_role: bq.string(),
  asset_pinned_position: bq.string().nullable(),
  asset_performance_label: bq.string().nullable(),
  asset_status: bq.string().nullable(),
  asset_id: bq.string().nullable(),
  asset_text: bq.string().nullable(),
  asset_image_url: media,
  asset_video_url: media,
  asset_video_id: bq.string().nullable(),
  asset_link_url: media,
});
export type CreativeAsset = z.output<typeof AssetRow>;
export type AssetScope = { storeId: string; channel: string; entity: string; role: string; cursor: string };

/** The asset view's own URL parameters. The others are Creative performance's and ride along, so returning keeps them. */
export const ASSET_PARAMS = ["view", "channel", "role", "entity", "cursor"];

/** Creative performance's own `view` (its layout), kept aside while the asset view owns `view`. */
const REPORT_VIEW = "report_view";

/** One platform's and creative's current assets, or all of them, from the report's parameters (store included). */
export function assetHref(params: SearchParams, channel?: string | null, entity?: string | null) {
  const view = single(params, "view");
  return withParams("/creatives", params, {
    view: "assets",
    [REPORT_VIEW]: view === "assets" ? (single(params, REPORT_VIEW) ?? null) : (view ?? null),
    channel: channel || null,
    entity: entity || null,
    role: null,
    cursor: null,
  });
}

/** Creative performance again, with the parameters it came with, its layout included. */
export function reportHref(params: SearchParams) {
  return withParams("/creatives", params, {
    view: single(params, REPORT_VIEW) ?? null,
    [REPORT_VIEW]: null,
    role: null,
    entity: null,
    cursor: null,
  });
}
