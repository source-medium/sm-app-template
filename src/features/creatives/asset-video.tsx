"use client";

import { useState } from "react";

/** Platforms can supply a file, a watch page, or a signed URL that has since expired. */
export function AssetVideo({
  src,
  poster,
  label,
  fallback,
}: {
  src: string;
  poster: string | null;
  label: string;
  fallback: React.ReactNode;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  return failed === src ? (
    <>
      {fallback}
      <p className="px-4 pt-2 text-xs text-muted-foreground">Inline playback unavailable. Try Open video.</p>
    </>
  ) : (
    <video
      controls
      muted
      preload="none"
      playsInline
      poster={poster ?? undefined}
      aria-label={label}
      src={src}
      onError={() => setFailed(src)}
      className="aspect-video w-full bg-muted object-contain"
    />
  );
}
