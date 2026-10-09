"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;

/** False on the server and during hydration, true once client handlers can run. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
