"use client";

import { createContext, useContext, useId, useState, type Dispatch, type SetStateAction } from "react";
import { NativeSelect } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { useReportNavigation } from "@/components/shell/report-navigation";
import { channelName, encodeSalesChannels, REPORT_FILTER_FORM_ID, salesChannelValues } from "@/lib/filters";

const ChannelScope = createContext<{
  applied: string[];
  selected: string[];
  setSelected: Dispatch<SetStateAction<string[]>>;
  /** The selection on its way, encoded; null when none is. */
  requested: string | null;
  apply: (channels: string[]) => void;
} | null>(null);

/**
 * One canonical form value lives outside the streamed roster, including during
 * loading and failure. Applying sends only the sales channel (an empty value is
 * an explicit All), so a draft in another field never blocks it. Key it by the
 * applied scope: a committed change remounts it with the new selection.
 */
export function SalesChannelFilter({ value, children }: { value?: string | null; children: React.ReactNode }) {
  const { navigate } = useReportNavigation();
  const [selected, setSelected] = useState(salesChannelValues(value));
  const [requested, setRequested] = useState<string | null>(null);
  return (
    <ChannelScope.Provider
      value={{
        applied: salesChannelValues(value),
        selected,
        setSelected,
        requested,
        apply: (channels) => {
          const encoded = encodeSalesChannels(channels) ?? "";
          setSelected(salesChannelValues(encoded));
          setRequested(encoded);
          navigate({ sales_channel: encoded });
        },
      }}
    >
      {/* The checkboxes' draft, for an explicit Apply; another control's change leaves it behind. */}
      <input
        type="hidden"
        name="sales_channel"
        value={encodeSalesChannels(selected) ?? ""}
        form={REPORT_FILTER_FORM_ID}
        data-draft
      />
      {children}
    </ChannelScope.Provider>
  );
}

/** One quick choice applies at once; several are drafted, then applied together. Unknown applied values remain visible. */
export function MultiChannelFilter({ channels }: { channels: string[] }) {
  const id = useId();
  const scope = useContext(ChannelScope);
  if (!scope) throw new Error("Wrap channel choices in SalesChannelFilter so scope survives loading.");
  const { applied, selected, setSelected, requested, apply } = scope;
  const draft = encodeSalesChannels(selected) ?? "";
  // A selection on its way is not a draft: the report says it is updating.
  const unapplied = draft !== (encodeSalesChannels(applied) ?? "") && draft !== requested;
  // The select shows the choice on its way at once, then the applied one.
  const shown = requested === null ? applied : salesChannelValues(requested);
  const options = [...new Set([...applied, ...selected, ...channels])].sort();
  return (
    <div className="max-w-full min-w-0" data-agent-target="Sales channels">
      <label htmlFor={`${id}-quick`} className="block pb-1 text-xs font-medium text-muted-foreground">
        Sales channel
      </label>
      <NativeSelect
        id={`${id}-quick`}
        aria-label="Sales channel"
        value={shown.length > 1 ? "__multiple" : (shown[0] ?? "")}
        onChange={(event) => {
          const value = event.currentTarget.value;
          if (value === "__multiple") return;
          apply(value ? [value] : []);
        }}
      >
        <option value="">All sales channels</option>
        {shown.length > 1 && <option value="__multiple">{shown.length} selected</option>}
        {options.map((channel) => (
          <option key={channel} value={channel}>
            {channelName(channel)}
          </option>
        ))}
      </NativeSelect>
      {unapplied && (
        <p role="status" className="pt-2 text-xs text-warning">
          Channel changes not applied.
        </p>
      )}
      <Disclosure summary="Choose multiple channels">
        <fieldset className="space-y-3 pb-2">
          <legend className="sr-only">Sales channels</legend>
          <label className="flex min-h-9 items-center gap-2 text-sm" htmlFor={`${id}-all`}>
            <input id={`${id}-all`} type="checkbox" checked={!selected.length} onChange={() => setSelected([])} />
            All sales channels
          </label>
          <div className="grid max-h-64 gap-1 overflow-y-auto">
            {options.map((channel, index) => (
              <label
                key={channel}
                htmlFor={`${id}-${index}`}
                className="flex min-h-9 items-center gap-2 text-sm break-words"
              >
                <input
                  id={`${id}-${index}`}
                  type="checkbox"
                  checked={selected.includes(channel)}
                  onChange={(event) =>
                    setSelected((current) =>
                      event.target.checked ? [...current, channel] : current.filter((item) => item !== channel),
                    )
                  }
                />
                {channelName(channel)}
              </label>
            ))}
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={() => apply(selected)}>
            Apply channels
          </Button>
        </fieldset>
      </Disclosure>
    </div>
  );
}
