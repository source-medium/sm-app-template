"use client";

/**
 * Immediate feedback for a link that starts a server round trip. The
 * indicator reads the pending state React already tracks for its own link, so
 * it appears on the next frame, before any data arrives, and goes away when the
 * new page commits. Report controls share one indicator instead
 * (report-navigation.tsx). Nothing here fetches or stores data.
 */
import { useLinkStatus } from "next/link";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/** Inside a <Link>: a spinner while that link's navigation is pending. */
export function LinkPending({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  return pending ? (
    <LoaderCircle
      aria-hidden
      data-slot="link-pending"
      className={cn("size-3.5 shrink-0 motion-safe:animate-spin", className)}
    />
  ) : null;
}
