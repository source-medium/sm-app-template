import { Suspense } from "react";
import { DataRegion } from "@/components/patterns/data-region";
import { LoadingState } from "@/components/patterns/data-states";
import { SelectFilter } from "@/components/patterns/select-filter";
import { channelName } from "@/lib/filters";
import { AcquisitionSegmentFilter } from "./segmentation-controls";
import { getRetentionChannels, getRetentionSegments, type RetentionSegmentFilters } from "./queries";

/** Applied fields stay in the report form while options load or fail. */
export function RetentionSegmentControls({ filters }: { filters: RetentionSegmentFilters }) {
  const applied = (
    <AcquisitionSegmentFilter
      segment={filters.segment ?? null}
      search={filters.search}
      values={[]}
      truncated={false}
      unavailable
    />
  );
  return (
    <Suspense
      key={`${filters.storeId}|${filters.asOf}|${filters.channel}|${filters.dimension}|${filters.search}`}
      fallback={
        <>
          {applied}
          <LoadingState variant="control" label="Loading acquisition segments" />
        </>
      }
    >
      <DataRegion
        timestamp={false}
        load={() => getRetentionSegments(filters)}
        isEmpty={() => false}
        emptyMessage="No acquisition segments."
        errorContent={applied}
      >
        {(segments) => (
          <AcquisitionSegmentFilter
            segment={filters.segment ?? null}
            search={filters.search}
            values={segments.values}
            truncated={segments.truncated}
          />
        )}
      </DataRegion>
    </Suspense>
  );
}

/** The store's acquisition channels in the window; the applied one stays a choice while they load or fail. */
export function RetentionChannelFilter({ storeId, asOf, channel }: { storeId: string; asOf: string; channel: string }) {
  const select = (channels: string[]) => (
    <SelectFilter
      name="channel"
      label="Acquisition sales channel"
      value={channel}
      options={[...new Set([channel, ...channels])].sort().map((value) => ({ value, label: channelName(value) }))}
    />
  );
  return (
    <Suspense key={`${storeId}|${asOf}|${channel}`} fallback={select([])}>
      <DataRegion
        timestamp={false}
        load={() => getRetentionChannels(storeId, asOf)}
        isEmpty={() => false}
        emptyMessage=""
        errorContent={select([])}
      >
        {(channels) => select(channels)}
      </DataRegion>
    </Suspense>
  );
}
