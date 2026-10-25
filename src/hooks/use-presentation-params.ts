"use client";

import { useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";

const CHANGE_EVENT = "sm-presentation-change";

function subscribe(changed: () => void) {
  window.addEventListener("popstate", changed);
  window.addEventListener(CHANGE_EVENT, changed);
  return () => {
    window.removeEventListener("popstate", changed);
    window.removeEventListener(CHANGE_EVENT, changed);
  };
}

/** The browser URL is authoritative for loaded-data presentation, including immediately after Back/reload. */
export function usePresentationParams() {
  const initial = useSearchParams().toString();
  // A fresh reader makes React recheck after Next commits its URL in an insertion effect.
  const search = useSyncExternalStore(
    subscribe,
    () => window.location.search,
    () => (initial ? `?${initial}` : ""),
  );
  return new URLSearchParams(search);
}

/** Native history keeps Next's route state; the event also synchronizes already-mounted chart controls. */
export function writePresentationUrl(url: URL, mode: "push" | "replace" = "push") {
  if (mode === "replace") window.history.replaceState(null, "", url);
  else window.history.pushState(null, "", url);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
