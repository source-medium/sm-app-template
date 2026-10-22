import { Suspense } from "react";
import { DataRegion } from "@/components/patterns/data-region";
import { LoadingState } from "@/components/patterns/data-states";
import { MultiChannelFilter, SalesChannelFilter } from "@/components/patterns/multi-channel-filter";
import { getOverviewChannels, type OverviewFilters } from "./queries";

export function OverviewControls({ filters }: { filters: OverviewFilters }) {
  const applied = <MultiChannelFilter channels={[]} />;
  return (
    <SalesChannelFilter
      key={`${filters.storeId}|${filters.range.from}|${filters.range.to}|${filters.channel}`}
      value={filters.channel}
    >
      <Suspense
        key={`${filters.storeId}|${filters.range.from}|${filters.range.to}|${filters.channel}`}
        fallback={<LoadingState variant="control" label="Loading sales channels" />}
      >
        <DataRegion
          timestamp={false}
          load={() => getOverviewChannels(filters)}
          isEmpty={() => false}
          emptyMessage="No sales channels in this range."
          errorContent={applied}
        >
          {(channels) => <MultiChannelFilter channels={channels} />}
        </DataRegion>
      </Suspense>
    </SalesChannelFilter>
  );
}
