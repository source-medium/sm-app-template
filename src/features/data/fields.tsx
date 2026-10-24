"use client";
import { SourceDictionary } from "@/components/shell/about-data";
import { USE_AGENT_FIELD, type AgentField } from "@/lib/report-data";
export function DataFields({ storeId, relation }: { storeId: string; relation: string }) {
  return (
    <SourceDictionary
      storeId={storeId}
      sources={[
        {
          relation,
          scope:
            "Published field documentation for the selected store. Statistical samples and row values are not displayed.",
        },
      ]}
      onUseField={(field) => window.dispatchEvent(new CustomEvent<AgentField>(USE_AGENT_FIELD, { detail: field }))}
    />
  );
}
