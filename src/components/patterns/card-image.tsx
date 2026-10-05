"use client";

/**
 * An external image that never renders broken: when it fails to load, the
 * fallback (usually the card's text) takes its place. A plain <img>, not
 * next/image, so the Worker never spends CPU optimizing remote images.
 *
 * The server renders the fallback and the browser swaps in the image after
 * hydration. An image's load or failure can then never race React's
 * hydration, and onError is always attached before the request starts.
 */
import { useState, useSyncExternalStore } from "react";

const subscribe = () => () => undefined;

/** False on the server and during hydration, true afterwards. */
function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

export function CardImage({ src, alt, fallback }: { src: string; alt: string; fallback: React.ReactNode }) {
  const hydrated = useHydrated();
  const [failed, setFailed] = useState(false);
  if (!hydrated || failed) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote creative images are hotlinked by design (docs/data.md)
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="aspect-square w-full bg-muted object-cover"
    />
  );
}
