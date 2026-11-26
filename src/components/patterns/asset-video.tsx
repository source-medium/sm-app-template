"use client";

import { Play } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { CardImage } from "./card-image";

const YOUTUBE_EMBED_ORIGIN = "https://www.youtube-nocookie.com";
const YOUTUBE_VIDEO_ID = /^[\w-]{11}$/;

/**
 * The privacy-enhanced embed for a YouTube watch, share, Shorts or embed link, or null for any other
 * URL. A <video> element cannot play a YouTube page, so these play in YouTube's own player instead.
 */
export function youtubeEmbedUrl(src: string): string | null {
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase().replace(/^(?:www|m)\./, "");
  const id =
    host === "youtu.be"
      ? url.pathname.slice(1)
      : host === "youtube.com" || host === "youtube-nocookie.com"
        ? url.pathname === "/watch"
          ? url.searchParams.get("v")
          : url.pathname.match(/^\/(?:shorts|embed)\/([^/]+)$/)?.[1]
        : null;
  if (!id || !YOUTUBE_VIDEO_ID.test(id)) return null;
  const embed = new URL(`/embed/${id}`, YOUTUBE_EMBED_ORIGIN);
  // Starts muted on Play as the native player does; enablejsapi lets pauseVideosOutside pause it.
  embed.search = new URLSearchParams({
    autoplay: "1",
    mute: "1",
    playsinline: "1",
    rel: "0",
    enablejsapi: "1",
  }).toString();
  return embed.href;
}

/** Pauses every player inside `root` but outside `keep`: a native video directly, a YouTube embed through its player API. */
export function pauseVideosOutside(root: Element, keep: Element | undefined) {
  for (const video of root.querySelectorAll("video")) {
    if (!keep?.contains(video) && !video.paused) video.pause();
  }
  for (const frame of root.querySelectorAll<HTMLIFrameElement>("iframe[data-youtube]")) {
    if (!keep?.contains(frame))
      frame.contentWindow?.postMessage(
        JSON.stringify({ event: "command", func: "pauseVideo", args: [] }),
        YOUTUBE_EMBED_ORIGIN,
      );
  }
}

/** The Play button is gone once the player mounts; keep keyboard focus on what replaced it. */
const focusOnMount = (player: HTMLElement | null) => player?.focus();

/**
 * Platforms can supply a file, a watch page, or a signed URL that has since expired.
 *
 * Until someone plays it, a video is its poster through CardImage: loaded lazily and without a
 * referrer, which a <video poster> can do neither of (media elements have no referrerpolicy). The
 * player mounts on Play and loads the video then, sending the origin as the page's Referrer-Policy
 * allows (src/lib/security-headers.ts). A YouTube link plays in YouTube's privacy-enhanced embed,
 * which refuses to play without that origin; any other URL plays in the native player.
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
  const embed = youtubeEmbedUrl(src);
  if (embed)
    return (
      <iframe
        ref={focusOnMount}
        src={embed}
        title={label}
        data-youtube=""
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        className={className}
      />
    );
  return (
    <video
      ref={focusOnMount}
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
