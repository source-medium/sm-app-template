"use client";

/**
 * An external image that never renders broken: when it fails to load, the
 * next published URL for the same image (`fallbackSrc`, such as a platform's
 * thumbnail) is tried, and only when every one fails does the fallback
 * (usually the card's text) take its place. A plain <img>, not next/image, so
 * the Worker never spends CPU optimizing remote images.
 *
 * The server renders the fallback and the browser swaps in the image after
 * hydration. An image's load or failure can then never race React's
 * hydration, and onError is always attached before the request starts.
 */
import { useState } from "react";
import { useHydrated } from "@/hooks/use-hydrated";
import { cn } from "@/lib/utils";

export function CardImage({
  src,
  fallbackSrc,
  alt,
  fallback,
  className,
  onUnavailable,
}: {
  src: string;
  /** Another URL for the same image, tried when `src` fails. */
  fallbackSrc?: string | null;
  alt: string;
  fallback: React.ReactNode;
  className?: string;
  /** Called once every source has failed, so a parent can drop the image instead of showing the fallback. */
  onUnavailable?: () => void;
}) {
  const hydrated = useHydrated();
  const [failed, setFailed] = useState<readonly string[]>([]);
  const sources = fallbackSrc && fallbackSrc !== src ? [src, fallbackSrc] : [src];
  const current = sources.find((source) => !failed.includes(source));
  if (!hydrated || current === undefined) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote creative images are hotlinked by design (docs/data.md)
    <img
      key={current}
      src={current}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => {
        const next = [...failed, current];
        setFailed(next);
        if (sources.every((source) => next.includes(source))) onUnavailable?.();
      }}
      className={cn("aspect-square w-full bg-muted object-cover", className)}
    />
  );
}
