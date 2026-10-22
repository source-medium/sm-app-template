"use client";

import { createContext, useContext, useId, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { NativeSelect } from "@/components/ui/native-select";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { encodeSalesChannels, REPORT_FILTER_FORM_ID, salesChannelValues } from "@/lib/filters";

const ChannelScope = createContext<{
  selected: string[];
  setSelected: Dispatch<SetStateAction<string[]>>;
  apply: (value: string) => void;
} | null>(null);

/** One canonical form value lives outside the streamed roster, including during loading and failure. */
export function SalesChannelFilter({ value, children }: { value?: string | null; children: React.ReactNode }) {
  const hidden = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState(salesChannelValues(value));
  return (
    <ChannelScope.Provider
      value={{
        selected,
        setSelected,
        apply: (value) => {
          setSelected(value ? [value] : []);
          if (hidden.current) {
            hidden.current.value = value;
            hidden.current.form?.requestSubmit();
          }
        },
      }}
    >
      <input
        ref={hidden}
        type="hidden"
        name="sales_channel"
        value={encodeSalesChannels(selected) ?? ""}
        form={REPORT_FILTER_FORM_ID}
      />
      {children}
    </ChannelScope.Provider>
  );
}

/** Draft several choices, then apply the whole report form once. Unknown applied values remain visible. */
export function MultiChannelFilter({ channels }: { channels: string[] }) {
  const id = useId();
  const scope = useContext(ChannelScope);
  if (!scope) throw new Error("Wrap channel choices in SalesChannelFilter so scope survives loading.");
  const { selected, setSelected, apply } = scope;
  const options = [...new Set([...selected, ...channels])].sort();
  return (
    <div className="max-w-full min-w-0 rounded-lg border bg-card px-3 py-1" data-agent-target="Sales channels">
      <label htmlFor={`${id}-quick`} className="block pb-1 text-xs font-medium text-muted-foreground">
        Sales channel
      </label>
      <NativeSelect
        id={`${id}-quick`}
        aria-label="Sales channel"
        value={selected.length > 1 ? "__multiple" : (selected[0] ?? "")}
        onChange={(event) => {
          const value = event.currentTarget.value;
          if (value === "__multiple") return;
          apply(value);
        }}
      >
        <option value="">All sales channels</option>
        {selected.length > 1 && <option value="__multiple">{selected.length} selected</option>}
        {options.map((channel) => (
          <option key={channel} value={channel}>
            {channel}
          </option>
        ))}
      </NativeSelect>
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
                {channel}
              </label>
            ))}
          </div>
          <Button type="submit" form={REPORT_FILTER_FORM_ID} variant="secondary" size="sm">
            Apply channels
          </Button>
        </fieldset>
      </Disclosure>
    </div>
  );
}
