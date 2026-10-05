"use client";

/**
 * An external image that never renders broken: when it fails to load, the
 * fallback (usually the card's text) takes its place. A plain <img>, not
 * next/image, so the Worker never spends CPU optimizing remote images.
 *
 * An image can fail before React hydrates and attaches onError, so the ref
 * also checks whether the browser already gave up on it.
 */
import { useCallback, useState } from "react";

export function CardImage({ src, alt, fallback }: { src: string; alt: string; fallback: React.ReactNode }) {
  const [failed, setFailed] = useState(false);
  const checkAlreadyFailed = useCallback((image: HTMLImageElement | null) => {
    if (image?.complete && image.naturalWidth === 0) setFailed(true);
  }, []);
  if (failed) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- remote creative images are hotlinked by design (docs/data.md)
    <img
      ref={checkAlreadyFailed}
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="aspect-square w-full bg-muted object-cover"
    />
  );
}
