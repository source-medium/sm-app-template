import { Suspense } from "react";
import { DataRegion } from "@/components/patterns/data-region";
import { LoadingState } from "@/components/patterns/data-states";
import { AcquisitionSegmentFilter } from "./segmentation-controls";
import { getRetentionSegments, type RetentionSegmentFilters } from "./queries";

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
