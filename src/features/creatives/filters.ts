import { single, type SearchParams } from "@/lib/filters";
export type CreativeIdentity = readonly [channel: string, creativeId: string];
export function parseCreativeThreshold(value: string | undefined): string | null {
  if (!value) return null;
  return /^(?:0|[1-9]\d{0,28})(?:\.\d{1,9})?$/.test(value) ? value : null;
}
export function parseCreativeSelection(params: SearchParams): { items: CreativeIdentity[]; error: string | null } {
  const raw = single(params, "selection");
  if (!raw) return { items: [], error: null };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      !Array.isArray(parsed) ||
      parsed.length > 4 ||
      !parsed.every(
        (item) =>
          Array.isArray(item) &&
          item.length === 2 &&
          item.every((part) => typeof part === "string" && part.length > 0 && part.length <= 200),
      )
    )
      throw new Error();
    const items = parsed as CreativeIdentity[];
    if (new Set(items.map((item) => JSON.stringify(item))).size !== items.length) throw new Error();
    return { items, error: null };
  } catch {
    return { items: [], error: "Choose up to four distinct creatives to compare. Clear the selection to start again." };
  }
}
