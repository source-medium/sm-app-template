import { DataRegion } from "@/components/patterns/data-region";
import { ChannelFilter } from "@/components/patterns/channel-filter";
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
        <ChannelFilter
          pathname="/overview"
          value={filters.channel}
          channels={channels}
          preserved={preservedParams(params, ["grain", "compare"], filters)}
        />
      )}
    </DataRegion>
  );
}
