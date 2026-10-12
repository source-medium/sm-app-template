"use client";

import { NativeSelect } from "@/components/ui/native-select";
import { SelectFilter } from "@/components/patterns/select-filter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { REPORT_FILTER_FORM_ID } from "@/lib/filters";
import { ACQUISITION_DIMENSIONS, type AcquisitionDimension } from "./filters";

export function AcquisitionDimensionFilter({ dimension }: { dimension: AcquisitionDimension }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor="acquisition-dimension" className="text-xs font-medium text-muted-foreground">
        Segment cohorts by
      </label>
      <NativeSelect
        id="acquisition-dimension"
        form={REPORT_FILTER_FORM_ID}
        name="acquisition_dimension"
        defaultValue={dimension}
        key={dimension}
        onChange={(event) => {
          const form = event.currentTarget.form;
          // A value from the old dimension must not be reused in the new one.
          const segment = form?.elements.namedItem("acquisition_segment");
          const search = form?.elements.namedItem("segment_search");
          if (segment instanceof HTMLSelectElement) segment.value = "";
          if (search instanceof HTMLInputElement) search.value = "";
          form?.requestSubmit();
        }}
      >
        {ACQUISITION_DIMENSIONS.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

export function AcquisitionSegmentFilter({
  segment,
  search,
  values,
  truncated,
  unavailable = false,
}: {
  segment: string | null;
  search: string;
  values: string[];
  truncated: boolean;
  unavailable?: boolean;
}) {
  const available = [...new Set([...(segment ? [segment] : []), ...values])];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-3">
        <SelectFilter
          name="acquisition_segment"
          label="Acquisition segment"
          value={segment ?? ""}
          options={[{ value: "", label: "Choose a segment" }, ...available.map((value) => ({ value, label: value }))]}
        />
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor="segment-search" className="text-xs font-medium text-muted-foreground">
            Find segment options
          </label>
          <Input
            id="segment-search"
            form={REPORT_FILTER_FORM_ID}
            name="segment_search"
            defaultValue={search}
            key={search}
            maxLength={200}
          />
        </div>
        <Button type="submit" form={REPORT_FILTER_FORM_ID} variant="secondary">
          Find segments
        </Button>
      </div>
      {truncated && (
        <p className="text-sm text-muted-foreground">
          Showing the first 200 matching segments. Narrow the search to find another. The selected segment stays
          applied.
        </p>
      )}
      {!unavailable && !values.length && (
        <p className="text-sm text-muted-foreground">
          No segment options match this channel, observation window and search.
        </p>
      )}
    </div>
  );
}
