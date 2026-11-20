"use client";

import { Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { CardImage } from "./card-image";

/**
 * Platforms can supply a file, a watch page, or a signed URL that has since expired.
 *
 * Until someone plays it, a video is its poster through CardImage: loaded lazily and without a
 * referrer, which a <video poster> can do neither of (media elements have no referrerpolicy). The
 * player mounts on Play and loads the file then, sending the origin as the page's Referrer-Policy
 * allows (src/lib/security-headers.ts).
 */
export function AssetVideo({
  src,
  poster,
  label,
  fallback,
  className,
}: {
  src: string;
  poster: string | null;
  label: string;
  fallback: React.ReactNode;
  className: string;
}) {
  const [playing, setPlaying] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  // The Play button is gone once the player mounts; keep keyboard focus on what replaced it.
  useEffect(() => {
    if (playing === src) video.current?.focus();
  }, [playing, src]);
  if (failed === src) return fallback;
  if (playing !== src)
    return (
      <button
        type="button"
        aria-label={`Play ${label}`}
        onClick={() => setPlaying(src)}
        className={cn(
          "group relative grid place-items-center focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
          className,
        )}
      >
        {poster && (
          <CardImage src={poster} alt="" fallback={null} className="absolute inset-0 size-full object-contain" />
        )}
        <span className="relative grid size-12 place-items-center rounded-full bg-background/90 shadow-sm group-hover:bg-background">
          <Play aria-hidden className="size-5" />
        </span>
      </button>
    );
  return (
    <video
      ref={video}
      controls
      autoPlay
      muted
      playsInline
      poster={poster ?? undefined}
      aria-label={label}
      src={src}
      onError={() => setFailed(src)}
      className={className}
    />
  );
}
