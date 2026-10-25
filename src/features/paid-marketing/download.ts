import { requireViewer } from "@/lib/auth/require-viewer";
import { csvExport, csvResponse, exportError, scopeColumns } from "@/lib/csv.server";
import { campaignRatios, getPaidCampaigns, paidChannel } from "./queries";
import { parseAdNameFilters, serializeAdNameFilters } from "@/lib/ad-name-filters";

/** Export the same filtered, bounded campaign set as the report, including all table pages. */
export async function GET(request: Request): Promise<Response> {
  await requireViewer();
  return csvExport(request, async (scope) => {
    const { params, storeId, range, mode } = scope;
    const names = parseAdNameFilters(params);
    if (names.error) return exportError(400, { title: "Check the name filters", remedy: names.error });
    const data = await getPaidCampaigns({ storeId, range, channel: paidChannel(params), names: names.rules });
    const rows = data.campaigns.map((row) => ({ ...row, ...campaignRatios(row) }));
    return csvResponse(
      `${mode}-campaigns${data.campaignsTruncated ? "-partial" : ""}-${range.from}-${range.to}.csv`,
      [
        ...scopeColumns(scope),
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
        { header: "name_filters", value: () => serializeAdNameFilters(names.rules) },
      ],
      rows,
    );
  });
}
