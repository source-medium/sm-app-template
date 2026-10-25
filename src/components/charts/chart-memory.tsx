"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import {
  CHART_MEMORY_COOKIE,
  parseChartMemory,
  rememberChartMetric,
  serializeChartMemory,
  type ChartMemory,
} from "@/lib/chart-memory";
import { setPreferenceCookie } from "@/lib/preference-cookie";

const ChartMemoryContext = createContext<{
  memory: ChartMemory;
  remember: (key: string, metric: string) => void;
} | null>(null);

/** `initial` is the cookie the server read for this request. */
export function ChartMemoryProvider({ initial, children }: { initial: ChartMemory; children: React.ReactNode }) {
  const [memory, setMemory] = useState(initial);
  const remember = useCallback((key: string, metric: string) => setMemory(writeChoice(key, metric)), []);
  const value = useMemo(() => ({ memory, remember }), [memory, remember]);
  return <ChartMemoryContext.Provider value={value}>{children}</ChartMemoryContext.Provider>;
}

/** The remembered measure for one chart, and a way to remember a new one. */
export function useChartMemory(key: string): [string | undefined, (metric: string) => void] {
  const context = useContext(ChartMemoryContext);
  const save = context?.remember;
  const remember = useCallback(
    (metric: string) => (save ? save(key, metric) : void writeChoice(key, metric)),
    [save, key],
  );
  return [context?.memory[key], remember];
}

/** Starts from the cookie, not React state, so other charts' entries written in another tab survive. */
function writeChoice(key: string, metric: string): ChartMemory {
  const current = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${CHART_MEMORY_COOKIE}=`))
    ?.slice(CHART_MEMORY_COOKIE.length + 1);
  const next = rememberChartMetric(parseChartMemory(current), key, metric);
  setPreferenceCookie(CHART_MEMORY_COOKIE, serializeChartMemory(next), 31536000);
  return next;
}
