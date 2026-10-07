import { z } from "zod";
import { bq } from "@/lib/data/decode";
import type { Creative } from "./queries";

export const CREATIVE_RELATION = "rpt_ad_performance_daily";
/** Cards per page of the grid; more is reported as truncation. */
export const MAX_CREATIVES = 48;

export const CreativeChannelRow = z.object({ channel: bq.string() });
export const CreativeRow = z.object({
  creative_id: bq.string(),
  title: bq.string().nullable(),
  body: bq.string().nullable(),
  image_url: bq.string().nullable(),
  thumbnail_url: bq.string().nullable(),
  call_to_action: bq.string().nullable(),
  channel: bq.string().nullable(),
  spend: bq.numeric().nullable(),
  impressions: bq.int64().nullable(),
  clicks: bq.int64().nullable(),
  conversions: bq.float64().nullable(),
  ctr: bq.float64().nullable(),
});

/** Only https or same-origin images render; anything else becomes a text card. */
function safeImageUrl(value: string | null): string | null {
  if (!value) return null;
  return /^https:\/\/[^\s"'<>]+$/i.test(value) || /^\/(?!\/)[A-Za-z0-9/_.-]+$/.test(value) ? value : null;
}

export function toCreative(row: z.output<typeof CreativeRow>): Creative {
  return {
    creativeId: row.creative_id,
    title: row.title,
    body: row.body,
    imageUrl: safeImageUrl(row.image_url) ?? safeImageUrl(row.thumbnail_url),
    callToAction: row.call_to_action,
    channel: row.channel,
    spend: row.spend,
    impressions: row.impressions,
    clicks: row.clicks,
    conversions: row.conversions,
    ctr: row.ctr,
  };
}
