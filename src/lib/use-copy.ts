import { useEffect, useState } from "react";

export type CopyState = "idle" | "copying" | "copied" | "failed";

/** A clipboard write with a two-second confirmation. A failure is the caller's cue to show the text for manual copying. */
export function useCopy(): { state: CopyState; copy: (text: string) => Promise<void> } {
  const [state, setState] = useState<CopyState>("idle");

  useEffect(() => {
    if (state !== "copied") return;
    const timer = window.setTimeout(() => setState("idle"), 2000);
    return () => window.clearTimeout(timer);
  }, [state]);

  async function copy(text: string) {
    setState("copying");
    try {
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return { state, copy };
}
