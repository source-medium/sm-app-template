import { formatCount } from "@/lib/format";
import { signalGroup, type OrderAttribution } from "./attribution";
export function AttributionView({ data }: { data: OrderAttribution }) {
  return (
    <section aria-labelledby="order-attribution-heading" className="mt-6 space-y-4 text-sm">
      <h3 id="order-attribution-heading" className="font-semibold">
        Why attributed here?
      </h3>
      <p>
        {data.winnerCount === 1n
          ? "One published priority-1 traffic winner."
          : data.winnerCount === 0n
            ? "No published priority-1 winner was found. Supporting evidence does not establish a winner."
            : `${formatCount(data.winnerCount)} priority-1 rows were published. The winner is ambiguous and requires source review.`}
      </p>
      <p className="text-muted-foreground">
        Priority is a per-order rank. A winning row need not have supplied every final UTM field. These rows carry
        evidence, not allocated order revenue. MTA, survey and discount-code context do not compete for primary credit.
      </p>
      {data.truncated && (
        <p role="status">
          Showing the first 100 signals. More signals exist; the winner count covers all matching signals.
        </p>
      )}
      <ol className="space-y-4">
        {data.signals.map((row, index) => (
          <li key={index} className="space-y-2 rounded-md border p-3">
            <p className="font-medium">{signalGroup(row)}</p>
            <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-x-3 gap-y-2">
              {[
                ["Evidence source", row.evidence_source],
                [
                  "Rank",
                  row.sm_utm_final_source_priority === null
                    ? "Not ranked"
                    : formatCount(row.sm_utm_final_source_priority),
                ],
                ["Marketing channel", row.sm_marketing_channel],
                ["Canonical source", row.sm_utm_source],
                ["Canonical medium", row.sm_utm_medium],
                ["Inference method", row.sm_attribution_inference_method],
              ].map(([label, value]) => (
                <div className="contents" key={label}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="break-words">{value ?? "Unavailable / not applicable"}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ol>
      <p>
        Raw identifiers, URLs and survey answers are excluded. Account attribution windows and model settings are
        unknown.
      </p>
      <p className="flex flex-wrap gap-3">
        <a
          className="underline"
          href="https://docs.sourcemedium.com/data-transformations/attribution-source-hierarchy"
          target="_blank"
          rel="noreferrer"
        >
          Attribution Source Hierarchy
        </a>
        <a
          className="underline"
          href="https://docs.sourcemedium.com/mta/mta-attribution-rules"
          target="_blank"
          rel="noreferrer"
        >
          MTA Attribution Rules
        </a>
      </p>
    </section>
  );
}
