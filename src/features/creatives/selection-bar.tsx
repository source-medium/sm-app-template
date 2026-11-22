import { CardImage } from "@/components/patterns/card-image";
import { PlatformMark } from "@/components/patterns/platform-mark";
import { buttonVariants } from "@/components/ui/button";
import { adPlatformLabel } from "@/lib/ad-platforms";
import { WarehouseError } from "@/lib/data/warehouse-error";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { creativeFormatLabel, type CreativeIdentity } from "./filters";
import type { Creative, CreativesData } from "./queries";

export const COMPARISON_HEADING = "creative-comparison-heading";

export function creativeTitle(creative: Creative): string {
  return creative.title ?? creative.name ?? creative.body ?? `Creative ${creative.creativeId}`;
}

export function matchesCreative(creative: Creative, [platform, id]: CreativeIdentity): boolean {
  return creative.channel === platform && creative.creativeId === id;
}

export function hasMissingSelection(selection: readonly CreativeIdentity[], creatives: readonly Creative[]): boolean {
  return selection.some((identity) => !creatives.some((creative) => matchesCreative(creative, identity)));
}

/**
 * Resolve selected creatives from the already-loaded ranking whenever it holds
 * every possible match (untruncated list, or every selected identity already
 * present), avoiding a redundant BigQuery scan. Fall back to the targeted
 * selection query when the list is truncated with an off-page pick, or when
 * the ranking fails with a warehouse error so comparison stays independent.
 */
export async function resolveSelectedCreatives(
  selection: readonly CreativeIdentity[],
  loadList: () => Promise<CreativesData>,
  loadSelectedFromSource: () => Promise<CreativesData>,
): Promise<CreativesData> {
  if (selection.length === 0) return { creatives: [], truncated: false, coverage: null };
  try {
    const list = await loadList();
    const matched = list.creatives.filter((creative) =>
      selection.some((identity) => matchesCreative(creative, identity)),
    );
    if (!list.truncated || !hasMissingSelection(selection, matched)) {
      return {
        creatives: matched,
        truncated: false,
        coverage: matched.length > 0 ? list.coverage : null,
      };
    }
  } catch (error) {
    if (!(error instanceof WarehouseError)) throw error;
  }
  return loadSelectedFromSource();
}

/** Keep the next action in sight while the operator is making picks in the ranking. */
export function SelectionBar({
  selection,
  creatives,
}: {
  selection: readonly CreativeIdentity[];
  creatives: Creative[];
}) {
  const picks = selection.map(([platform, id]) => {
    const c = creatives.find((item) => matchesCreative(item, [platform, id]));
    return {
      id,
      platform,
      title: c ? creativeTitle(c) : id,
      image: c?.imageUrl,
      format: c?.format ? creativeFormatLabel(c.format) : null,
      started: c?.firstSpend && c.firstSpend.when !== "older" ? c.firstSpend.date : null,
    };
  });
  const count = picks.length;
  const labels = picks.map((pick) => {
    const samePlatform = picks.filter(
      (other) => other !== pick && other.title === pick.title && other.platform === pick.platform,
    );
    const parts = [adPlatformLabel(pick.platform)];
    if (samePlatform.length && pick.format) parts.push(pick.format);
    const sameFormat = samePlatform.filter((other) => other.format === pick.format);
    if (sameFormat.length && pick.started) parts.push(formatDate(pick.started));
    if (sameFormat.some((other) => other.started === pick.started)) parts.push(pick.id);
    return parts.join(" · ");
  });
  return (
    <>
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {count > 0 &&
          `${count} selected for comparison. ${picks.map((pick, i) => `${pick.title}, ${labels[i]}`).join(". ")}. ${count === 1 ? "Choose one more creative to compare." : "View comparison is available."}`}
      </p>
      {count > 0 && (
        <aside
          aria-label="Your comparison"
          className="sticky bottom-2 z-10 space-y-2 rounded-xl border-2 border-primary bg-card px-3 py-2 text-card-foreground shadow-lg sm:px-4"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold">
              {count === 1 ? "1 creative selected" : `${count} creatives selected`}
            </p>
            {count >= 2 && (
              <a href={`#${COMPARISON_HEADING}`} className={buttonVariants({ size: "sm" })}>
                View comparison
              </a>
            )}
          </div>
          <ul
            aria-label="Selected ads"
            className={cn("grid gap-x-3 gap-y-2", count > 1 && "grid-cols-2 lg:flex lg:flex-wrap lg:gap-x-6")}
          >
            {picks.map((pick, i) => {
              const mark = <PlatformMark platform={pick.platform} />;
              return (
                <li key={JSON.stringify([pick.platform, pick.id])} className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden
                    className="grid size-9 shrink-0 place-items-center overflow-hidden rounded bg-muted"
                  >
                    {pick.image ? (
                      <CardImage src={pick.image} alt="" fallback={mark} className="size-full object-contain" />
                    ) : (
                      mark
                    )}
                  </span>
                  <span className="min-w-0 text-xs leading-tight">
                    <span className="line-clamp-2 font-medium" title={pick.title}>
                      {pick.title}
                    </span>
                    <span className="block [overflow-wrap:anywhere] text-muted-foreground">{labels[i]}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          {count === 1 && <p className="text-xs text-muted-foreground">Choose one more creative to compare.</p>}
        </aside>
      )}
    </>
  );
}

/**
 * Resolves metadata and thumbnails for off-page selections when the ranking is
 * truncated, falling back gracefully to the visible ranking on warehouse error.
 */
export async function ResolvedSelectionBar({
  selection,
  creatives,
  loadSelected,
}: {
  selection: readonly CreativeIdentity[];
  creatives: Creative[];
  loadSelected: () => Promise<CreativesData>;
}) {
  let resolved = creatives;
  if (selection.length > 0) {
    try {
      const selected = await loadSelected();
      if (selected.creatives.length > 0) resolved = [...selected.creatives, ...creatives];
    } catch (error) {
      if (!(error instanceof WarehouseError)) throw error;
    }
  }
  return <SelectionBar selection={selection} creatives={resolved} />;
}
