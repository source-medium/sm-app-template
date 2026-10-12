import { Suspense } from "react";
import { DataRegion } from "@/components/patterns/data-region";
import { LoadingState } from "@/components/patterns/data-states";
import { ChannelFilter } from "@/components/patterns/channel-filter";
import { getOverviewChannels, type OverviewFilters } from "./queries";

export function OverviewControls({ filters }: { filters: OverviewFilters }) {
  const applied = <ChannelFilter value={filters.channel} channels={[]} />;
  return (
    <Suspense
      key={`${filters.storeId}|${filters.range.from}|${filters.range.to}|${filters.channel}`}
      fallback={
        <>
          {applied}
          <LoadingState variant="control" label="Loading sales channels" />
        </>
      }
    >
      <DataRegion
        timestamp={false}
        load={() => getOverviewChannels(filters)}
        isEmpty={() => false}
        emptyMessage="No sales channels in this range."
        errorContent={applied}
      >
        {(channels) => <ChannelFilter value={filters.channel} channels={channels} />}
      </DataRegion>
    </Suspense>
  );
}
