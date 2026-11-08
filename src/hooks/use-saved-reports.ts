"use client";

import { useMemo, useSyncExternalStore } from "react";
import { appConfig } from "@/app.config";
import { parseSavedReports, SAVED_REPORTS_KEY, type SavedReport } from "@/lib/saved-reports";

/**
 * Browser-saved report views: one store for the Share menu that saves them and
 * the sidebar that lists them. Storage is per browser and may be unavailable,
 * so every read tolerates failure and every write reports it.
 */
const CHANGED = "sm-saved-reports-changed";
export const SAVED_REPORT_PATHS = appConfig.nav.map((item) => item.href);

function subscribe(update: () => void) {
  window.addEventListener("storage", update);
  window.addEventListener(CHANGED, update);
  return () => {
    window.removeEventListener("storage", update);
    window.removeEventListener(CHANGED, update);
  };
}
function snapshot() {
  try {
    return window.localStorage.getItem(SAVED_REPORTS_KEY);
  } catch {
    return null;
  }
}
const serverSnapshot = () => null;

/** Re-read at each mutation, so views saved in another tab are kept. */
export function readSavedReports(): SavedReport[] {
  return parseSavedReports(snapshot(), SAVED_REPORT_PATHS);
}

/** False when the browser refused the write (private mode, full storage). */
export function writeSavedReports(next: SavedReport[]): boolean {
  try {
    window.localStorage.setItem(SAVED_REPORTS_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(CHANGED));
    return true;
  } catch {
    return false;
  }
}

export function useSavedReports(): SavedReport[] {
  const raw = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  return useMemo(() => parseSavedReports(raw, SAVED_REPORT_PATHS), [raw]);
}
