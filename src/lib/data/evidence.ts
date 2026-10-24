/** Metadata observations are not pipeline completion or business-result evidence. */
export type Availability = "accessible" | "missing" | "denied" | "incompatible" | "unknown";
export type DictionaryObservation = {
  dataset: string;
  relation: string;
  storeId: string | null;
  hasData: boolean | null;
  recentRecord: boolean | null;
  observedDate: string | null;
};
export type SourceEvidence = {
  dataset: string;
  relation: string;
  scope: "store" | "global" | "unknown";
  metadata: Availability;
  consistency: "consistent" | "inconsistent" | "unknown";
  observedDate: string | null;
  freshness: "unknown";
  completeness: "unknown";
  quality: "unknown";
};

export function sourceEvidence(
  dataset: string,
  relation: string,
  storeId: string,
  observations: readonly DictionaryObservation[],
  metadata: Availability = "accessible",
): SourceEvidence {
  const matching = observations.filter((row) => row.dataset === dataset && row.relation === relation);
  const scoped = matching.filter((row) => row.storeId === storeId);
  const global = matching.filter((row) => row.storeId === null);
  const facts = new Set(
    scoped.map(({ hasData, recentRecord, observedDate }) => JSON.stringify([hasData, recentRecord, observedDate])),
  );
  const consistent = facts.size === 1;
  return {
    dataset,
    relation,
    metadata,
    scope: scoped.length ? "store" : global.length ? "global" : "unknown",
    consistency: facts.size > 1 ? "inconsistent" : consistent ? "consistent" : "unknown",
    observedDate: consistent ? (scoped[0]?.observedDate ?? null) : null,
    freshness: "unknown",
    completeness: "unknown",
    quality: "unknown",
  };
}
