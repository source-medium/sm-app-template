"use client";

import { useEffect, useId, useState } from "react";
import { Check, Copy, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Sheet, SheetTrigger, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  AGENT_INTENTS,
  agentIntent,
  agentTargetLabel,
  composeAgentPrompt,
  type AgentIntentId,
  type AgentPageSnapshot,
  type AgentReportContext,
  type AgentTarget,
} from "@/lib/agent-prompt";
import { useCopy } from "@/lib/use-copy";
import { USE_AGENT_FIELD, type AgentField } from "@/lib/report-data";

const EMPTY_PAGE: AgentPageSnapshot = { pathname: "/", title: "Page", filters: {}, currency: null, targets: [] };
const targetKey = (target: AgentTarget) => JSON.stringify(target);

/**
 * "Ask a coding agent": one sentence from the person plus the page's own
 * context becomes a prompt to paste into any agent working in this repository.
 * The page is read from the document each time the sheet opens, so the prompt
 * describes what is on screen now.
 */
export function AgentPrompt({ mode, build }: { mode: "sample" | "live"; build: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(EMPTY_PAGE);
  const [intentId, setIntentId] = useState<AgentIntentId>("fix");
  const [request, setRequest] = useState("");
  const [targetId, setTargetId] = useState("");
  const [lastCopied, setLastCopied] = useState("");
  const [field, setField] = useState<AgentField>();
  const { state, copy } = useCopy();
  const target = page.targets.find((item) => targetKey(item) === targetId);
  const prompt = composeAgentPrompt(intentId, request, { ...page, mode, build }, target, field);
  useEffect(() => {
    function onUseField(event: Event) {
      setPage(readPage());
      setField((event as CustomEvent<AgentField>).detail);
      setIntentId("add");
      setTargetId("");
      setRequest("");
      setOpen(true);
    }
    window.addEventListener(USE_AGENT_FIELD, onUseField);
    return () => window.removeEventListener(USE_AGENT_FIELD, onUseField);
  }, []);
  const copyState = state === "copied" && lastCopied !== prompt ? "idle" : state;
  function show(next: boolean) {
    if (next) {
      const snapshot = readPage();
      if (snapshot.filters.store !== page.filters.store) setField(undefined);
      if (snapshot.pathname !== page.pathname) {
        setRequest("");
        setTargetId("");
        setField(undefined);
      } else if (!snapshot.targets.some((item) => targetKey(item) === targetId)) {
        setTargetId("");
      }
      setPage(snapshot);
    }
    setOpen(next);
  }

  return (
    <Sheet open={open} onOpenChange={show}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" size="sm" aria-label="Ask a coding agent" className="px-2 sm:px-2.5">
          <Sparkles aria-hidden />
          <span className="hidden sm:inline">Ask agent</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Ask a coding agent</SheetTitle>
          <SheetDescription>
            Builds a prompt with this page&apos;s context. Paste it into Codex, Claude Code, or any agent working in
            this app&apos;s repository.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-4">
          {field && (
            <div className="rounded-md border p-3 text-sm break-words">
              <p>
                Selected field: <strong>{field.name}</strong>
              </p>
              <p className="text-xs text-muted-foreground">{field.relation}</p>
              <Button variant="ghost" size="sm" onClick={() => setField(undefined)}>
                Remove field
              </Button>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-target`} className="text-xs font-medium text-muted-foreground">
              Target
            </label>
            <NativeSelect
              id={`${id}-target`}
              value={target ? targetId : ""}
              onChange={(event) => setTargetId(event.currentTarget.value)}
            >
              <option value="">This page</option>
              {page.targets.map((item) => (
                <option key={targetKey(item)} value={targetKey(item)}>
                  {agentTargetLabel(item)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-intent`} className="text-xs font-medium text-muted-foreground">
              What do you need?
            </label>
            <NativeSelect
              id={`${id}-intent`}
              value={intentId}
              onChange={(event) => setIntentId(event.currentTarget.value as AgentIntentId)}
            >
              {AGENT_INTENTS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-request`} className="text-xs font-medium text-muted-foreground">
              Describe it
            </label>
            <Textarea
              id={`${id}-request`}
              rows={4}
              placeholder={agentIntent(intentId).placeholder}
              value={request}
              onChange={(event) => setRequest(event.currentTarget.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-prompt`} className="text-xs font-medium text-muted-foreground">
              Prompt
            </label>
            <Textarea
              id={`${id}-prompt`}
              readOnly
              rows={12}
              value={prompt}
              onFocus={(event) => event.currentTarget.select()}
              className="font-mono text-xs md:text-xs"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Includes applied report filters and the selected component label. Search text, row details, and unrelated
            URL parameters are excluded.
            {page.omitted?.length
              ? ` Not included on this page: ${page.omitted.join(", ")}. Add relevant details in your request if needed.`
              : ""}
          </p>
          <Button
            type="button"
            onClick={() => {
              setLastCopied(prompt);
              void copy(prompt);
            }}
            disabled={copyState === "copying"}
          >
            {copyState === "copied" ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copyState === "copied" ? "Copied" : copyState === "copying" ? "Copying…" : "Copy prompt"}
          </Button>
          <p aria-live="polite" className={copyState === "failed" ? "text-xs text-muted-foreground" : "sr-only"}>
            {copyState === "copied"
              ? "Prompt copied."
              : copyState === "failed"
                ? "Could not copy. Select the prompt above and copy it."
                : ""}
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Read only context declared by the report and loaded shared patterns, never arbitrary URL values or row text. */
function readPage(): AgentPageSnapshot {
  const root = document.querySelector("main");
  const declared = root?.querySelector("[data-agent-page]")?.getAttribute("data-agent-page");
  const report: AgentReportContext = declared
    ? (JSON.parse(declared) as AgentReportContext)
    : {
        pathname: window.location.pathname,
        title: root?.querySelector("h1")?.textContent?.trim() || "Page",
        filters: {},
        currency: null,
        status: "Report context is unavailable. Ask for the store and dates before reproducing a data issue.",
      };
  const occurrences = new Map<string, number>();
  const targets: AgentTarget[] = [];
  for (const element of root?.querySelectorAll("[data-agent-target][data-agent-component]") ?? []) {
    const label = element.getAttribute("data-agent-target")?.trim();
    const component = element.getAttribute("data-agent-component")?.trim();
    if (!label || !component) continue;
    const key = JSON.stringify([label, component]);
    const occurrence = (occurrences.get(key) ?? 0) + 1;
    occurrences.set(key, occurrence);
    targets.push({ label, component, occurrence });
  }
  return { ...report, targets };
}
