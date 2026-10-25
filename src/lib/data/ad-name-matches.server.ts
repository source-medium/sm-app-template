import "server-only";
import { z } from "zod";
import { requireViewer } from "../auth/require-viewer";
import type { ReportFilters } from "../filters";
import { MAX_MATCHED_NAMES, type AdNameMatches, type AdNameRule } from "../ad-name-filters";
import { bq, decodeRows } from "./decode";
import { adNamePredicate } from "./ad-name-sql";
import { AD_PLATFORM_SQL } from "./channel-sql";

const NameRow = z.object({
  campaign: bq.string().nullable(),
  ad_group: bq.string().nullable(),
  ad: bq.string().nullable(),
});

/** A bounded inspection list, never a source of report totals or selectable facets. `channel` is the ad platform. */
export async function queryAdNameMatches(
  filters: ReportFilters & { channel?: string | null; campaign?: string | null; names?: AdNameRule[] },
  creativeOnly: boolean,
): Promise<AdNameMatches> {
  const { warehouse } = await requireViewer({ live: true, storeId: filters.storeId });
  const names = adNamePredicate(filters.names);
  const result = await warehouse.query({
    name: "ad_name_matches",
    maxRows: MAX_MATCHED_NAMES,
    partial: true,
    sql: `SELECT DISTINCT ad_campaign_name AS campaign, ad_group_name AS ad_group, ad_name AS ad
      FROM ${warehouse.table("rpt_ad_performance_daily")}
      WHERE sm_store_id = @store_id AND date BETWEEN @start_date AND @end_date
        AND (@channel = '' OR ${AD_PLATFORM_SQL} = @channel)
        AND (@campaign = '' OR ad_campaign_id = @campaign)
        ${creativeOnly ? "AND ad_creative_id IS NOT NULL" : ""}
        AND ${names.sql}
      ORDER BY campaign, ad_group, ad LIMIT ${MAX_MATCHED_NAMES + 1}`,
    params: [
      { name: "store_id", type: "STRING", value: filters.storeId },
      { name: "start_date", type: "DATE", value: filters.range.from },
      { name: "end_date", type: "DATE", value: filters.range.to },
      { name: "channel", type: "STRING", value: filters.channel ?? "" },
      { name: "campaign", type: "STRING", value: filters.campaign ?? "" },
      ...names.params,
    ],
  });
  return { rows: decodeRows(NameRow, result.rows, "rpt_ad_performance_daily"), truncated: result.truncated };
}
