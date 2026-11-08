import type { ChangeTone } from "@/lib/comparison";

/** The one place a change's tone becomes a color. The signed text still carries the direction, so color is never the only cue. */
export const CHANGE_TONE_CLASS: Record<ChangeTone, string> = { good: "text-success", bad: "text-destructive" };
