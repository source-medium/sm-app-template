import { DataRegion } from "@/components/patterns/data-region";
import { ChannelFilter } from "@/components/patterns/channel-filter";
import { getOverviewChannels, type OverviewFilters } from "./queries";

export function OverviewControls({ filters }: { filters: OverviewFilters }) {
  return (
    <DataRegion
      timestamp={false}
      load={() => getOverviewChannels(filters)}
      isEmpty={() => false}
      emptyMessage="No sales channels in this range."
    >
      {(channels) => <ChannelFilter value={filters.channel} channels={channels} />}
    </DataRegion>
  );
}
