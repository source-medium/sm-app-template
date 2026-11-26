import { z } from "zod";
import { bq } from "@/lib/data/decode";
import { safeImageUrl } from "@/lib/image-url";
import { single, withParams, type SearchParams } from "@/lib/filters";
import { CREATIVE_VIEWS } from "./filters";

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
  // The image at display size (SourceMedium's smaller copy, else the image): previews show it, Open image links the original.
  asset_display_image_url: media,
  asset_video_url: media,
  asset_video_id: bq.string().nullable(),
  asset_link_url: media,
});
export type CreativeAsset = z.output<typeof AssetRow>;
export type AssetScope = { storeId: string; channel: string; entity: string; role: string; cursor: string };

/** The asset view's own URL parameters. The others are Creative performance's and ride along, so returning keeps them. */
export const ASSET_PARAMS = ["view", "channel", "role", "entity", "cursor"];

/**
 * Creative performance's own parameters that the asset view also uses (its layout and its ad platform),
 * kept aside as `report_<name>` while the asset view owns them, so returning restores the report as it was.
 */
const REPORT_OWNED = ["view", "channel"] as const;
const stashed = (name: (typeof REPORT_OWNED)[number]) => `report_${name}`;

/** One platform's and creative's current assets, or all of them, from the report's parameters (store included). */
export function assetHref(params: SearchParams, channel?: string | null, entity?: string | null) {
  // Within the asset view the report's values are already kept aside; keep them, never the view's own.
  const fromAssets = single(params, "view") === "assets";
  const kept = Object.fromEntries(
    REPORT_OWNED.map((name) => [stashed(name), single(params, fromAssets ? stashed(name) : name) ?? null]),
  );
  return withParams("/creatives", params, {
    ...kept,
    view: "assets",
    channel: channel || null,
    entity: entity || null,
    role: null,
    cursor: null,
  });
}

/** Creative performance again, with the parameters it came with, its layout and ad platform included. */
export function reportHref(params: SearchParams) {
  const view = single(params, stashed("view"));
  return withParams("/creatives", params, {
    view: view && (CREATIVE_VIEWS as readonly string[]).includes(view) ? view : null,
    channel: single(params, stashed("channel")) ?? null,
    ...Object.fromEntries(REPORT_OWNED.map((name) => [stashed(name), null])),
    role: null,
    entity: null,
    cursor: null,
  });
}
