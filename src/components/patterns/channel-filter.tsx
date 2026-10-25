import { Suspense } from "react";
import { REPORT_FILTER_FORM_ID, salesChannelValues } from "@/lib/filters";
import { DataRegion } from "./data-region";
import { LoadingState } from "./data-states";
import { SelectFilter } from "./select-filter";

type ChannelLabels = {
  name?: string;
  label?: string;
  allLabel?: string;
  /** Names each option; the default reads a carried sales-channel list as its channels. */
  optionLabel?: (value: string) => string;
};

/** A list of several channels carried from a multi-channel report reads as its channels, not as JSON. */
function channelLabel(value: string): string {
  const channels = salesChannelValues(value);
  return channels.length > 1 ? channels.join(", ") : value;
}

/** The channel picker. Each feature loads its own store/date-scoped channel roster for it. */
function ChannelFilter({
  name = "sales_channel",
  label = "Sales channel",
  allLabel = "All sales channels",
  optionLabel = channelLabel,
  channels,
  value,
}: ChannelLabels & {
  channels: string[];
  value?: string | null;
}) {
  return (
    <SelectFilter
      name={name}
      label={label}
      value={value ?? ""}
      options={[
        { value: "", label: allLabel },
        ...[...new Set([...(value ? [value] : []), ...channels])].sort().map((channel) => ({
          value: channel,
          label: optionLabel(channel),
        })),
      ]}
    />
  );
}

/**
 * The channel control with its roster loading in its own region. The applied
 * channel keeps submitting with the report form while the roster loads, and
 * stays selectable if it fails, so changing another filter never widens the
 * report to every channel. Key it by the filters the roster reads.
 */
export function ChannelRosterFilter({
  load,
  value,
  loadingLabel,
  ...labels
}: ChannelLabels & {
  load: () => Promise<string[]>;
  value?: string | null;
  loadingLabel: string;
}) {
  return (
    <Suspense
      fallback={
        <>
          <input type="hidden" name={labels.name ?? "sales_channel"} value={value ?? ""} form={REPORT_FILTER_FORM_ID} />
          <LoadingState variant="control" label={loadingLabel} />
        </>
      }
    >
      <DataRegion
        timestamp={false}
        load={load}
        // An empty roster still shows "All" and the applied channel.
        isEmpty={() => false}
        emptyMessage=""
        errorContent={<ChannelFilter {...labels} value={value} channels={[]} />}
      >
        {(channels) => <ChannelFilter {...labels} value={value} channels={channels} />}
      </DataRegion>
    </Suspense>
  );
}
