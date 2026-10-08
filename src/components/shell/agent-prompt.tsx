"use client";

import { useId, useState } from "react";
import { Check, Copy, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  AGENT_INTENTS,
  agentIntent,
  composeAgentPrompt,
  type AgentIntentId,
  type AgentPageSnapshot,
} from "@/lib/agent-prompt";
import { useCopy } from "@/lib/use-copy";

const EMPTY_PAGE: AgentPageSnapshot = { pathname: "/", params: {}, headings: [] };

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
  const { state, copy } = useCopy();
  const prompt = composeAgentPrompt(intentId, request, { ...page, mode, build });
  function show(next: boolean) {
    if (next) setPage(readPage());
    setOpen(next);
  }

  return (
    <Sheet open={open} onOpenChange={show}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-label="Ask a coding agent"
        onClick={() => show(true)}
        className="px-2 sm:px-2.5"
      >
        <Sparkles aria-hidden />
        <span className="hidden sm:inline">Ask agent</span>
      </Button>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Ask a coding agent</SheetTitle>
          <SheetDescription>
            Builds a prompt with this page&apos;s context. Paste it into Claude Code, Cursor, or any agent working in
            this app&apos;s repository.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-4">
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
          <Button type="button" onClick={() => void copy(prompt)} disabled={state === "copying"}>
            {state === "copied" ? <Check aria-hidden /> : <Copy aria-hidden />}
            {state === "copied" ? "Copied" : state === "copying" ? "Copying…" : "Copy prompt"}
          </Button>
          <p aria-live="polite" className={state === "failed" ? "text-xs text-muted-foreground" : "sr-only"}>
            {state === "copied"
              ? "Prompt copied."
              : state === "failed"
                ? "Could not copy. Select the prompt above and copy it."
                : ""}
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** The URL and the page title, section headings, chart titles, and KPI labels, in reading order. */
function readPage(): AgentPageSnapshot {
  const root = document.querySelector("main") ?? document.body;
  return {
    pathname: window.location.pathname,
    params: Object.fromEntries(new URLSearchParams(window.location.search)),
    headings: Array.from(
      root.querySelectorAll('h1, h2, h3, [data-slot="card-title"], [data-slot="kpi-label"]'),
      (element) => element.textContent ?? "",
    ),
  };
}
