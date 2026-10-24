import { withParams } from "./filters";

export type Investigation = {
  store: string;
  from: string;
  to: string;
  dateBasis: string;
  population: string;
  /** The first and second comparison modes (`compare`, `compare2`), carried together. */
  comparison?: string | null;
  comparison2?: string | null;
  /** Applied material filters only. Presentation choices and row cursors are not scope. */
  filters: Readonly<Record<string, string | null | undefined>>;
};
export type Destination = {
  pathname: string;
  dateBasis: string;
  population: string;
  supportsComparison?: boolean;
  /** Explicit source-to-destination names; sales channel and ad channel are never inferred. */
  filters: Readonly<Record<string, string>>;
  required?: Readonly<Record<string, string>>;
};
export function drillDown(
  context: Investigation,
  destination: Destination,
): { href: string | null; reasons: string[] } {
  const reasons: string[] = [];
  if (context.dateBasis !== destination.dateBasis)
    reasons.push(`Date basis changes from ${context.dateBasis} to ${destination.dateBasis}.`);
  if (context.population !== destination.population)
    reasons.push(`Population changes from ${context.population} to ${destination.population}.`);
  const mapped: Record<string, string> = {};
  for (const [key, value] of Object.entries(context.filters)) {
    if (value === null || value === undefined || value === "") continue;
    const target = destination.filters[key];
    if (!target) reasons.push(`The destination cannot preserve ${key.replaceAll("_", " ")}.`);
    else mapped[target] = value;
  }
  if (context.comparison && context.comparison !== "off" && !destination.supportsComparison)
    reasons.push("The destination does not support this comparison.");
  if (reasons.length) return { href: null, reasons };
  return {
    href: withParams(
      destination.pathname,
      {},
      {
        ...destination.required,
        ...mapped,
        store: context.store,
        from: context.from,
        to: context.to,
        ...(destination.supportsComparison
          ? { compare: context.comparison ?? null, compare2: context.comparison2 ?? null }
          : {}),
      },
    ),
    reasons,
  };
}
