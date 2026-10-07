import { DataRegion } from "@/components/patterns/data-region";
import { SelectFilter } from "@/components/patterns/select-filter";
import { preservedParams, type SearchParams } from "@/lib/filters";
import { getOverviewChannels, type OverviewFilters } from "./queries";

export function OverviewControls({ filters, params }: { filters: OverviewFilters; params: SearchParams }) {
  return (
    <DataRegion
      load={() => getOverviewChannels(filters)}
      isEmpty={() => false}
      emptyMessage="No sales channels in this range."
    >
      {(channels) => (
        <SelectFilter
          pathname="/overview"
          name="sales_channel"
          label="Sales channel"
          value={filters.channel ?? ""}
          options={[
            { value: "", label: "All sales channels" },
            ...[...new Set([...(filters.channel ? [filters.channel] : []), ...channels])].map((value) => ({
              value,
              label: value,
            })),
          ]}
          preserved={preservedParams(params, ["grain", "compare"], filters)}
        />
      )}
    </DataRegion>
  );
}
