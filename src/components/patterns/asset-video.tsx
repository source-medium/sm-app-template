"use client";

import { useState } from "react";

/** Platforms can supply a file, a watch page, or a signed URL that has since expired. */
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
  const [failed, setFailed] = useState<string | null>(null);
  return failed === src ? (
    fallback
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
      className={className}
    />
  );
}
