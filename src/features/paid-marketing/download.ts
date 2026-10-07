import { appConfig } from "@/app.config";
import { requireViewer } from "@/lib/auth/require-viewer";
import { csvResponse } from "@/lib/csv.server";
import { loadStores } from "@/lib/data/stores.server";
import { WarehouseError } from "@/lib/data/warehouse-error";
import { parseDateRange, single, type SearchParams } from "@/lib/filters";
import { campaignRatios, getPaidCampaigns, paidChannel } from "./queries";

/** Export the same filtered, bounded campaign set as the report, including all table pages. */
export async function GET(request: Request): Promise<Response> {
  const access = await requireViewer();
  const params: SearchParams = {};
  for (const [key, value] of new URL(request.url).searchParams) if (params[key] === undefined) params[key] = value;
  const range = parseDateRange(params, new Date());
  try {
    const storeId = single(params, "store")?.slice(0, 200) || (await loadStores())[0]?.id;
    if (!storeId)
      return Response.json(
        { title: "No store selected" },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    const data = await getPaidCampaigns({ storeId, range, channel: paidChannel(params) });
    const rows = data.campaigns.map((row) => ({ ...row, ...campaignRatios(row) }));
    return csvResponse(
      `${access.mode}-campaigns${data.campaignsTruncated ? "-partial" : ""}-${range.from}-${range.to}.csv`,
      [
        { header: "data_mode", value: () => access.mode },
        { header: "store_id", value: () => storeId },
        { header: "from", value: () => range.from },
        { header: "to", value: () => range.to },
        { header: "reporting_currency", value: () => appConfig.currency },
        { header: "export_truncated", value: () => data.campaignsTruncated },
        { header: "campaign_id", value: (row) => row.campaignId },
        { header: "campaign_name", value: (row) => row.campaignName },
        { header: "channel", value: (row) => row.channel },
        { header: "spend", value: (row) => row.spend, numeric: true },
        { header: "impressions", value: (row) => row.impressions, numeric: true },
        { header: "clicks", value: (row) => row.clicks, numeric: true },
        { header: "platform_conversions", value: (row) => row.conversions, numeric: true },
        { header: "platform_revenue", value: (row) => row.platformRevenue, numeric: true },
        { header: "ctr_fraction", value: (row) => row.ctr, numeric: true },
        { header: "cpc", value: (row) => row.cpc, numeric: true },
        { header: "platform_roas", value: (row) => row.roas, numeric: true },
      ],
      rows,
    );
  } catch (error) {
    if (!(error instanceof WarehouseError)) throw error;
    return Response.json(
      { title: error.title, remedy: error.remedy },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
