"use client";

/**
 * Which comparison slot a report's overlay and change columns show. Both
 * slots' data arrive with the page, so switching mounts the other already
 * rendered variant and updates the URL through native history: no request.
 * KPI cards show both slots and do not use this.
 */
import { createContext, useContext, useState } from "react";
import { Button } from "@/components/ui/button";
import { REPORT_FILTER_FORM_ID } from "@/lib/filters";

export type Slot = 0 | 1;
const SLOT_PARAM = "baseline";
const SLOT_VALUES = ["a", "b"] as const;

const ActiveBaselineContext = createContext<{ active: Slot; choose: (slot: Slot) => void } | null>(null);

export function BaselineProvider({ initial, children }: { initial: Slot; children: React.ReactNode }) {
  const [active, setActive] = useState<Slot>(initial);
  function choose(slot: Slot) {
    setActive(slot);
    const url = new URL(window.location.href);
    if (slot === 0) url.searchParams.delete(SLOT_PARAM);
    else url.searchParams.set(SLOT_PARAM, SLOT_VALUES[slot]);
    window.history.replaceState(null, "", url);
  }
  return (
    <ActiveBaselineContext.Provider value={{ active, choose }}>
      {active === 1 && <input type="hidden" name={SLOT_PARAM} value="b" form={REPORT_FILTER_FORM_ID} />}
      {children}
    </ActiveBaselineContext.Provider>
  );
}

function useActiveBaseline() {
  return useContext(ActiveBaselineContext);
}

/** Two buttons naming the slots; a slot without dates is listed but disabled. */
export function BaselineSwitch({ labels, available }: { labels: [string, string]; available: [boolean, boolean] }) {
  const context = useActiveBaseline();
  if (!context || available.filter(Boolean).length < 2) return null;
  return (
    <div role="group" aria-label="Comparison shown in charts and tables" className="flex flex-wrap items-center gap-2">
      {labels.map((label, index) => {
        const slot = index as Slot;
        return (
          <Button
            key={label}
            type="button"
            size="sm"
            variant={context.active === slot ? "default" : "outline"}
            aria-pressed={context.active === slot}
            disabled={!available[slot]}
            onClick={() => context.choose(slot)}
          >
            {label}
          </Button>
        );
      })}
    </div>
  );
}

/** Renders the variant for the active slot; both are server-rendered and travel with the page. */
export function ActiveBaseline({ a, b }: { a: React.ReactNode; b: React.ReactNode }) {
  const context = useActiveBaseline();
  return <>{(context?.active ?? 0) === 1 ? b : a}</>;
}
