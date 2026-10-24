"use client";

/**
 * Immediate feedback for the controls that start a server round trip. Each
 * indicator reads the pending state React already tracks for its own link or
 * form, so it appears on the next frame, before any data arrives, and goes
 * away when the new page commits. Nothing here fetches or stores data.
 */
import { useLinkStatus } from "next/link";
import { useFormStatus } from "react-dom";
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

/**
 * Inside a form's submit button: its label, swapped for the pending label
 * while a submission or navigation is pending. Controls stay enabled so a
 * second choice can still be made; React keeps the latest submission.
 */
export function SubmitPending({ idle, pending: pendingLabel }: { idle: string; pending: string }) {
  const { pending } = useFormStatus();
  return (
    <span className="flex items-center gap-1.5">
      {pending && <LoaderCircle aria-hidden className="size-3.5 motion-safe:animate-spin" />}
      {pending ? pendingLabel : idle}
    </span>
  );
}

/**
 * Inside a form, beside its controls (never inside a button, where an open
 * overlay's hide-others pass would hide the button's label around it): one
 * polite announcement while the form's submission is pending.
 */
export function SubmitAnnouncement({ pending: pendingLabel }: { pending: string }) {
  const { pending } = useFormStatus();
  return (
    <span aria-live="polite" className="sr-only">
      {pending ? pendingLabel : ""}
    </span>
  );
}
