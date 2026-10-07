import { SelectFilter } from "./select-filter";

/** Shared channel control. Each feature loads its own store/date-scoped channel roster. */
export function ChannelFilter({
  pathname,
  name = "sales_channel",
  label = "Sales channel",
  allLabel = "All sales channels",
  channels,
  value,
  preserved,
}: {
  pathname: string;
  name?: string;
  label?: string;
  allLabel?: string;
  channels: string[];
  value?: string | null;
  preserved: Record<string, string>;
}) {
  return (
    <SelectFilter
      pathname={pathname}
      name={name}
      label={label}
      value={value ?? ""}
      options={[
        { value: "", label: allLabel },
        ...[...new Set([...(value ? [value] : []), ...channels])].sort().map((channel) => ({
          value: channel,
          label: channel,
        })),
      ]}
      preserved={preserved}
    />
  );
}
