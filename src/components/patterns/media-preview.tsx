"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { AssetVideo } from "./asset-video";
import { CardImage } from "./card-image";

/** An image's `fallbackSrc` is another URL for the same image, tried before the slide is dropped. */
export type PreviewMedia =
  { kind: "image"; src: string; fallbackSrc?: string | null } | { kind: "video"; src: string; poster: string | null };

const mediaKey = (item: PreviewMedia) => item.kind + item.src;

/**
 * The creative's images and videos, one slide each. An image slide whose every
 * source fails is removed, and the counter and controls count only the slides
 * that remain; when none remain, the fallback shows once.
 */
export function MediaPreview({
  items,
  title,
  fallback,
  frameClassName,
}: {
  items: PreviewMedia[];
  title: string;
  fallback: React.ReactNode;
  frameClassName?: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const id = useId();
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<readonly string[]>([]);
  const visible = items.filter((item) => !failed.includes(mediaKey(item)));
  const multiple = visible.length > 1;
  // A removed slide shifts the later ones down; the scroll offset then shows the slide now at this index.
  const shown = Math.max(0, Math.min(index, visible.length - 1));
  function move(next: number) {
    const el = track.current;
    if (el) el.scrollTo({ left: el.clientWidth * next });
  }
  return (
    <div role="group" aria-label={`${title} media`} className={multiple ? "relative pb-9" : undefined}>
      <div
        id={id}
        ref={track}
        role="group"
        aria-label={multiple ? "Scrollable media" : undefined}
        // A scroll region takes keyboard focus so arrow keys can scroll it, as in ui/table.tsx.
        {...(multiple ? { tabIndex: 0 } : {})}
        className={cn(
          "flex aspect-[4/3] snap-x snap-mandatory overflow-x-auto overscroll-x-contain bg-muted focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring sm:aspect-square",
          frameClassName,
        )}
        onScroll={(event) => {
          const el = event.currentTarget;
          if (!el.clientWidth) return;
          const next = Math.max(0, Math.min(visible.length - 1, Math.round(el.scrollLeft / el.clientWidth)));
          setIndex(next);
          for (const video of el.querySelectorAll("video")) {
            if (!el.children[next]?.contains(video) && !video.paused) video.pause();
          }
        }}
      >
        {visible.length === 0 && (
          <div className="flex min-w-full shrink-0 basis-full snap-start overflow-hidden">{fallback}</div>
        )}
        {visible.map((item, i) => (
          <div key={mediaKey(item)} className="flex min-w-full shrink-0 basis-full snap-start overflow-hidden">
            {item.kind === "video" ? (
              <AssetVideo
                src={item.src}
                poster={item.poster}
                className="size-full bg-muted object-contain"
                label={`${title}, video ${i + 1}`}
                fallback={
                  <a href={item.src} target="_blank" rel="noreferrer" className="m-auto text-sm underline">
                    Open video (opens in a new tab)
                  </a>
                }
              />
            ) : (
              <CardImage
                src={item.src}
                fallbackSrc={item.fallbackSrc}
                alt={`${title}, image ${i + 1}`}
                fallback={fallback}
                className="size-full object-contain"
                onUnavailable={() => setFailed((keys) => [...keys, mediaKey(item)])}
              />
            )}
          </div>
        ))}
      </div>
      {multiple && (
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between border-b px-2 text-xs">
          <button
            type="button"
            aria-label="Previous media"
            aria-controls={id}
            disabled={shown === 0}
            onClick={() => move(shown - 1)}
            className="grid size-9 place-items-center rounded hover:bg-muted disabled:opacity-30"
          >
            <ChevronLeft size={17} />
          </button>
          <span aria-live="polite">
            {visible[shown]?.kind === "video" ? "Video" : "Image"} {shown + 1} of {visible.length}
          </span>
          <button
            type="button"
            aria-label="Next media"
            aria-controls={id}
            disabled={shown >= visible.length - 1}
            onClick={() => move(shown + 1)}
            className="grid size-9 place-items-center rounded hover:bg-muted disabled:opacity-30"
          >
            <ChevronRight size={17} />
          </button>
        </div>
      )}
    </div>
  );
}
