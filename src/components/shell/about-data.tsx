"use client";

import { useEffect, useId, useRef, useState } from "react";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { AgentReportContext } from "@/lib/agent-prompt";
import {
  USE_AGENT_FIELD,
  DICTIONARY_FIELD_LIMIT,
  type DictionaryReport,
  type AgentField,
  type ReportSource,
} from "@/lib/report-data";

/** Report-local documentation. No metadata fetch or extra report query until opened. */
export function AboutData({
  context,
  sources,
  mode,
}: {
  context: AgentReportContext;
  sources: readonly ReportSource[];
  mode: "sample" | "live";
}) {
  const [open, setOpen] = useState(false);
  const pendingField = useRef<AgentField | null>(null);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <BookOpen aria-hidden />
          About this data
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-lg"
        onCloseAutoFocus={(event) => {
          if (!pendingField.current) return;
          event.preventDefault();
          window.dispatchEvent(new CustomEvent<AgentField>(USE_AGENT_FIELD, { detail: pendingField.current }));
          pendingField.current = null;
        }}
      >
        <SheetHeader>
          <SheetTitle>About this data</SheetTitle>
          <SheetDescription>{context.title}: definitions, sources, and published fields.</SheetDescription>
        </SheetHeader>
        {open && (
          <div className="flex min-w-0 flex-col gap-5 px-4 pb-6">
            <details className="rounded-md border p-3 text-sm">
              <summary className="cursor-pointer font-medium">Report context</summary>
              <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs">
                {Object.entries(context.filters).map(([key, value]) => (
                  <div key={key} className="contents">
                    <dt className="text-muted-foreground">{key.replaceAll("_", " ")}</dt>
                    <dd className="break-words">{value ?? "All"}</dd>
                  </div>
                ))}
                <dt className="text-muted-foreground">Reporting currency</dt>
                <dd>{context.currency ?? "Not configured; amounts shown as published."}</dd>
              </dl>
              {context.status && <p className="mt-3 text-xs">{context.status}</p>}
              {!!context.omitted?.length && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Private context omitted: {context.omitted.join(", ")}.
                </p>
              )}
            </details>
            <p className="text-xs text-muted-foreground">
              {mode === "live"
                ? "Data freshness unknown. Each report section shows when its query completed. Query time does not tell us when the warehouse last refreshed."
                : "Synthetic sample data. Field documentation comes from the bundled schema snapshot; your warehouse may differ."}
            </p>
            <LoadedDefinitions />
            <SourceDictionary
              sources={sources}
              storeId={context.filters.store}
              onUseField={(field) => {
                pendingField.current = field;
                setOpen(false);
              }}
            />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** Reuse the actual definitions in loaded report components, including streamed regions. */
function readDefinitions() {
  return [...document.querySelectorAll("main [data-metric-definition]")].map((element) => ({
    label: element.getAttribute("data-metric-definition") ?? "Metric",
    text: element.textContent ?? "",
  }));
}

function LoadedDefinitions() {
  const [definitions, setDefinitions] = useState(readDefinitions);
  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;
    const observer = new MutationObserver(() => setDefinitions(readDefinitions()));
    observer.observe(main, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);
  if (!definitions.length) return null;
  return (
    <details className="rounded-md border p-3 text-sm">
      <summary className="cursor-pointer font-medium">Report metric definitions</summary>
      <dl className="mt-3 space-y-3">
        {definitions.map(({ label, text }, index) => (
          <div key={`${label}|${index}`}>
            <dt className="font-medium">{label}</dt>
            <dd className="mt-1 text-xs leading-relaxed text-muted-foreground">{text}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function SourceDictionary({
  sources,
  storeId,
  onUseField,
}: {
  sources: readonly ReportSource[];
  storeId: string | null | undefined;
  onUseField: (field: AgentField) => void;
}) {
  const id = useId();
  const [selected, setSelected] = useState(sources[0]?.relation);
  const source = sources.find((item) => item.relation === selected);
  if (!source) return null;
  return (
    <section className="flex min-w-0 flex-col gap-3" aria-label="Source fields">
      <h2 className="font-semibold">Source fields</h2>
      {sources.length > 1 && (
        <>
          <label htmlFor={id} className="text-xs text-muted-foreground">
            Source table
          </label>
          <NativeSelect id={id} value={selected} onChange={(event) => setSelected(event.currentTarget.value)}>
            {sources.map((item) => (
              <option key={item.relation} value={item.relation}>
                {item.relation}
              </option>
            ))}
          </NativeSelect>
        </>
      )}
      <p className="font-mono text-xs break-all">{source.relation}</p>
      <p className="text-xs text-muted-foreground">{source.scope}</p>
      <p className="text-xs text-muted-foreground">
        Published field descriptions may differ from this report&apos;s calculations. Some fields are available for
        extending the report and are not currently used.
      </p>
      {storeId ? (
        <Dictionary
          key={`${storeId}|${source.relation}`}
          storeId={storeId}
          relation={source.relation}
          onUseField={onUseField}
        />
      ) : (
        <p className="text-sm">Choose a store to see its dictionary.</p>
      )}
    </section>
  );
}

function Dictionary({
  storeId,
  relation,
  onUseField,
}: {
  storeId: string;
  relation: string;
  onUseField: (field: AgentField) => void;
}) {
  const id = useId();
  const [report, setReport] = useState<DictionaryReport | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const [response, { DictionaryReport }] = await Promise.all([
          fetch(`/data-dictionary?${new URLSearchParams({ store: storeId, relation })}`, {
            signal: controller.signal,
            cache: "no-store",
          }),
          import("@/lib/data/dictionary-report"),
        ]);
        if (!response.ok) throw new Error("Dictionary unavailable");
        const result = DictionaryReport.parse(await response.json());
        if (!controller.signal.aborted) setReport(result);
      } catch {
        if (!controller.signal.aborted)
          setError(
            "The dictionary could not load. Your report is still available. Try again, or open Connection to check warehouse access.",
          );
      }
    }
    void load();
    return () => controller.abort();
  }, [storeId, relation, attempt]);
  if (error)
    return (
      <div role="status" className="space-y-2 text-sm">
        <p>{error}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setError("");
            setAttempt((value) => value + 1);
          }}
        >
          Try again
        </Button>
      </div>
    );
  if (!report)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading field documentation…
      </p>
    );
  if (!report.fields.length)
    return (
      <p className="text-sm text-muted-foreground">
        No field documentation is published for this source and store. The report can still run.
      </p>
    );
  const query = search.trim().toLowerCase();
  const fields = report.fields.filter((field) =>
    `${field.name} ${field.type ?? ""} ${field.description ?? ""}`.toLowerCase().includes(query),
  );
  return (
    <>
      <label htmlFor={id} className="text-xs font-medium">
        Search fields
      </label>
      <Input
        id={id}
        type="search"
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
        placeholder="Name, type, or description"
      />
      {report.truncated && (
        <p className="text-xs text-muted-foreground">
          Showing the first {DICTIONARY_FIELD_LIMIT} fields. Search covers only these fields.
        </p>
      )}
      {!fields.length && <p className="text-sm text-muted-foreground">No fields match your search.</p>}
      <ul className="divide-y">
        {fields.map((field, index) => (
          <li key={`${field.name}|${index}`} className="space-y-2 py-3">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="min-w-0 font-mono text-xs font-medium break-all">{field.name}</span>
              <span className="text-xs text-muted-foreground">{field.type ?? "Type undocumented"}</span>
            </div>
            <p className="text-xs leading-relaxed break-words text-muted-foreground">
              {field.description ?? "No published description."}
            </p>
            <Button
              variant="outline"
              size="sm"
              aria-label={`Use field ${field.name}`}
              onClick={() => onUseField({ ...field, relation, origin: report.mode })}
            >
              Use this field
            </Button>
          </li>
        ))}
      </ul>
    </>
  );
}
