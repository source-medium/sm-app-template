"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, Copy, MousePointer2, Sparkles } from "lucide-react";
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
import { AgentTargetPicker, readAgentTargets } from "./agent-target-picker";

const EMPTY_PAGE: AgentPageSnapshot = { pathname: "/", title: "Page", filters: {}, currency: null, targets: [] };
const targetKey = (target: AgentTarget) => JSON.stringify(target);

/** Compose from declared report context, refreshing as navigation and streamed regions settle. */
export function AgentPrompt({ mode, build }: { mode: "sample" | "live"; build: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const pickingActive = useRef(false);
  const requestInput = useRef<HTMLTextAreaElement>(null);
  const previewInput = useRef<HTMLTextAreaElement>(null);
  const currentPage = useRef(EMPTY_PAGE);
  const [page, setPage] = useState(EMPTY_PAGE);
  const [intentId, setIntentId] = useState<AgentIntentId>("change");
  const [request, setRequest] = useState("");
  const [targetId, setTargetId] = useState("");
  const [lastCopied, setLastCopied] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [contextNotice, setContextNotice] = useState("");
  const [field, setField] = useState<AgentField>();
  const { state, copy } = useCopy();
  const target = page.targets.find((item) => targetKey(item) === targetId);
  const prompt = composeAgentPrompt(intentId, request, { ...page, mode, build }, target, field);
  const copyState = state === "copied" && lastCopied !== prompt ? "idle" : state;

  const refreshPage = useCallback(() => {
    const snapshot = readPage();
    const previous = currentPage.current;
    if (JSON.stringify(previous) === JSON.stringify(snapshot)) return snapshot;
    const moved = snapshot.pathname !== previous.pathname;
    const scopeChanged = JSON.stringify(snapshot.filters) !== JSON.stringify(previous.filters);
    if (moved) {
      setRequest("");
      setTargetId("");
      setField(undefined);
    } else {
      if (snapshot.filters.store !== previous.filters.store) setField(undefined);
      setTargetId((selected) => {
        const candidate = snapshot.targets.find((item) => targetKey(item) === selected);
        return candidate && !(scopeChanged && candidate.item) ? selected : "";
      });
    }
    if (previous !== EMPTY_PAGE && (moved || scopeChanged)) {
      setContextNotice(
        moved ? "Page changed. Start a request for this report." : "Report context updated. Your draft is preserved.",
      );
    }
    currentPage.current = snapshot;
    setPage(snapshot);
    return snapshot;
  }, []);

  useEffect(() => {
    function onUseField(event: Event) {
      refreshPage();
      setField((event as CustomEvent<AgentField>).detail);
      setIntentId("add");
      setTargetId("");
      setRequest("");
      setOpen(true);
    }
    window.addEventListener(USE_AGENT_FIELD, onUseField);
    return () => window.removeEventListener(USE_AGENT_FIELD, onUseField);
  }, [refreshPage]);

  useEffect(() => {
    if (!open && !picking) return;
    const root = document.querySelector("main");
    if (!root) return;
    // Attribute filtering avoids observing control values, row text, and picker hover styling.
    const observer = new MutationObserver(refreshPage);
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        "data-agent-page",
        "data-agent-target",
        "data-agent-component",
        "data-agent-element",
        "data-agent-item",
      ],
    });
    refreshPage();
    return () => observer.disconnect();
  }, [open, picking, refreshPage]);

  useEffect(() => {
    if (state === "failed") previewInput.current?.focus();
  }, [state]);

  function show(next: boolean) {
    if (next) refreshPage();
    setOpen(next);
  }
  function finishPicking(selected?: AgentTarget) {
    refreshPage();
    if (selected) setTargetId(targetKey(selected));
    pickingActive.current = false;
    setPicking(false);
    setOpen(true);
  }
  async function copyPrompt() {
    if (!request.trim()) return;
    // Copy and preview use the same current snapshot, even immediately after a streamed update.
    const snapshot = refreshPage();
    if (snapshot.pathname !== page.pathname) return;
    const selected = snapshot.targets.find((item) => targetKey(item) === targetId);
    const sameScope = JSON.stringify(snapshot.filters) === JSON.stringify(page.filters);
    const latestPrompt = composeAgentPrompt(
      intentId,
      request,
      { ...snapshot, mode, build },
      selected?.item && !sameScope ? undefined : selected,
      snapshot.filters.store === page.filters.store ? field : undefined,
    );
    setLastCopied(latestPrompt);
    await copy(latestPrompt);
  }
  // Keep the menu short; a precise picked control/card appears alongside section choices.
  const menuTargets = page.targets.filter((item) => (!item.element && !item.item) || targetKey(item) === targetId);

  return (
    <>
      <Sheet open={open} onOpenChange={show}>
        <SheetTrigger asChild>
          <Button type="button" variant="outline" size="sm" aria-label="Vibe code" className="px-2 sm:px-2.5">
            <Sparkles aria-hidden />
            <span className="hidden sm:inline">Vibe code</span>
          </Button>
        </SheetTrigger>
        {!picking && (
          <SheetContent
            side="right"
            className="h-dvh w-full gap-0 sm:max-w-md"
            onCloseAutoFocus={(event) => {
              if (pickingActive.current) event.preventDefault();
            }}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              requestInput.current?.focus();
            }}
          >
            <SheetHeader className="shrink-0">
              <SheetTitle>Vibe code</SheetTitle>
              <SheetDescription>Prepare a request for Codex, Claude Code, or your coding agent.</SheetDescription>
            </SheetHeader>
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${id}-request`} className="text-sm font-medium">
                  Your request
                </label>
                <Textarea
                  ref={requestInput}
                  id={`${id}-request`}
                  rows={4}
                  placeholder={agentIntent(intentId).placeholder}
                  value={request}
                  onChange={(event) => setRequest(event.currentTarget.value)}
                  aria-describedby={!request.trim() ? `${id}-copy-help` : undefined}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor={`${id}-target`} className="text-sm font-medium">
                    Target
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!page.targets.length}
                    onClick={() => {
                      setOpen(false);
                      pickingActive.current = true;
                      setPicking(true);
                    }}
                  >
                    <MousePointer2 aria-hidden /> Pick an element
                  </Button>
                </div>
                <NativeSelect
                  id={`${id}-target`}
                  value={target ? targetId : ""}
                  onChange={(event) => setTargetId(event.currentTarget.value)}
                >
                  <option value="">This page</option>
                  {menuTargets.map((item) => (
                    <option key={targetKey(item)} value={targetKey(item)}>
                      {agentTargetLabel(item)}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${id}-intent`} className="text-sm font-medium">
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
              <div
                aria-label="Current report"
                role="region"
                className="flex flex-col gap-1 border-t pt-3 text-sm break-words"
              >
                <p className="font-medium">{page.title}</p>
                {page.filters.store && <p className="text-muted-foreground">Store: {page.filters.store}</p>}
                {page.filters.from && page.filters.to && (
                  <p className="text-muted-foreground">
                    {page.filters.from} to {page.filters.to}
                  </p>
                )}
                {page.status && <p className="text-muted-foreground">{page.status}</p>}
                <p role="status" className={contextNotice ? "text-xs text-muted-foreground" : "sr-only"}>
                  {contextNotice}
                </p>
              </div>
              <details
                open={previewOpen || copyState === "failed"}
                onToggle={(event) => setPreviewOpen(event.currentTarget.open)}
              >
                <summary className="min-h-9 cursor-pointer rounded-sm py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:min-h-11">
                  Preview prompt
                </summary>
                <div className="flex flex-col gap-2 pt-2">
                  <label className="sr-only" htmlFor={`${id}-prompt`}>
                    Prompt
                  </label>
                  <Textarea
                    ref={previewInput}
                    id={`${id}-prompt`}
                    readOnly
                    rows={8}
                    value={prompt}
                    onFocus={(event) => event.currentTarget.select()}
                    className="font-mono text-xs md:text-xs"
                  />
                  <p className="text-xs text-muted-foreground">
                    Includes applied filters and selected UI labels or card positions. Search text, row contents, and
                    unrelated URL parameters are excluded.
                    {page.omitted?.length
                      ? ` Not included on this page: ${page.omitted.join(", ")}. Add relevant details in your request if needed.`
                      : ""}
                  </p>
                </div>
              </details>
            </div>
            <div className="flex shrink-0 flex-col gap-2 border-t bg-background p-4">
              <Button
                type="button"
                onClick={() => void copyPrompt()}
                disabled={!request.trim() || copyState === "copying"}
              >
                {copyState === "copied" ? <Check aria-hidden /> : <Copy aria-hidden />}
                {copyState === "copied" ? "Copied" : copyState === "copying" ? "Copying…" : "Copy prompt"}
              </Button>
              {!request.trim() && (
                <p id={`${id}-copy-help`} className="text-xs text-muted-foreground">
                  Describe what you need to enable copying.
                </p>
              )}
              <p aria-live="polite" className={copyState === "failed" ? "text-xs text-muted-foreground" : "sr-only"}>
                {copyState === "copied"
                  ? "Prompt copied."
                  : copyState === "failed"
                    ? "Could not copy. Select the prompt above and copy it."
                    : ""}
              </p>
            </div>
          </SheetContent>
        )}
      </Sheet>
      {picking && <AgentTargetPicker onPick={finishPicking} onCancel={() => finishPicking()} />}
    </>
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
  return { ...report, targets: readAgentTargets().map(({ target }) => target) };
}
