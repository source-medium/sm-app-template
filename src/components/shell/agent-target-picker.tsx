"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MousePointer2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { agentTargetLabel, type AgentTarget } from "@/lib/agent-prompt";

const OWNER = "[data-agent-target][data-agent-component]";
const SELECTOR = `${OWNER}, [data-agent-element], [data-agent-item]`;

/** Read only declared UI metadata. Never infer labels from row text or input values. */
export function readAgentTargets(): { element: HTMLElement; target: AgentTarget }[] {
  const occurrences = new Map<string, number>();
  const owners = new Map<Element, AgentTarget>();
  for (const element of document.querySelectorAll<HTMLElement>(`main ${OWNER}`)) {
    const label = element.dataset.agentTarget?.trim();
    const component = element.dataset.agentComponent?.trim();
    if (!label || !component) continue;
    const key = JSON.stringify([label, component]);
    const occurrence = (occurrences.get(key) ?? 0) + 1;
    occurrences.set(key, occurrence);
    owners.set(element, { label, component, occurrence });
  }
  return Array.from(document.querySelector("main")?.querySelectorAll<HTMLElement>(SELECTOR) ?? []).flatMap(
    (element) => {
      const owner = element.closest(OWNER);
      const target = owner ? owners.get(owner) : undefined;
      if (!target) return [];
      const item = element.closest<HTMLElement>("[data-agent-item]");
      const index = Number(item?.dataset.agentItem);
      return [
        {
          element,
          target: {
            ...target,
            ...(Number.isInteger(index) && index > 0 ? { item: index } : {}),
            ...(element.dataset.agentElement ? { element: element.dataset.agentElement } : {}),
          },
        },
      ];
    },
  );
}

export function AgentTargetPicker({
  onPick,
  onCancel,
}: {
  onPick: (target: AgentTarget) => void;
  onCancel: () => void;
}) {
  const [highlight, setHighlight] = useState<{ target: AgentTarget; rect: DOMRect }>();
  const [missed, setMissed] = useState(false);
  const banner = useRef<HTMLDivElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const outline = useRef<HTMLButtonElement>(null);
  const callbacks = useRef({ onPick, onCancel });
  useEffect(() => {
    callbacks.current = { onPick, onCancel };
  });

  useEffect(() => {
    let selected: ReturnType<typeof readAgentTargets>[number] | undefined;
    let keyboardSelection = false;
    cancel.current?.focus({ preventScroll: true });
    function show(item: typeof selected) {
      selected = item;
      setHighlight(item ? { target: item.target, rect: item.element.getBoundingClientRect() } : undefined);
    }
    function targetAt(event: Event) {
      const element = event.target instanceof Element ? event.target.closest(SELECTOR) : null;
      return readAgentTargets().find((item) => item.element === element);
    }
    function inControls(event: Event) {
      return (
        event.target instanceof Node && (banner.current?.contains(event.target) || event.target === outline.current)
      );
    }
    function move(event: PointerEvent) {
      // A resting or moving pointer cannot erase a target chosen with the keyboard.
      if (keyboardSelection || inControls(event)) return;
      const item = targetAt(event);
      if (item?.element !== selected?.element) show(item);
      if (item) setMissed(false);
    }
    function click(event: MouseEvent) {
      if (inControls(event)) return;
      event.preventDefault();
      event.stopPropagation();
      const item = targetAt(event);
      if (item) callbacks.current.onPick(item.target);
      else setMissed(true);
    }
    function pointerDown(event: PointerEvent) {
      if (!inControls(event)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    function key(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        callbacks.current.onCancel();
      } else if (event.key === "Tab") {
        event.preventDefault();
        keyboardSelection = true;
        setMissed(false);
        const items = readAgentTargets().filter((item) => item.element.getClientRects().length > 0);
        const index = selected ? items.findIndex((item) => item.element === selected?.element) : -1;
        const next = event.shiftKey ? (index === -1 ? items.length - 1 : index - 1) : index + 1;
        const item = items[next];
        if (item) {
          item.element.scrollIntoView({ block: "center", behavior: "instant" });
          show(item);
          outline.current?.focus({ preventScroll: true });
        } else {
          show(undefined);
          cancel.current?.focus({ preventScroll: true });
        }
      }
    }
    function reposition() {
      if (selected?.element.isConnected) show(selected);
      else if (selected) {
        show(undefined);
        cancel.current?.focus({ preventScroll: true });
      }
    }
    document.addEventListener("pointermove", move, true);
    document.addEventListener("pointerdown", pointerDown, true);
    document.addEventListener("click", click, true);
    document.addEventListener("keydown", key, true);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("pointermove", move, true);
      document.removeEventListener("pointerdown", pointerDown, true);
      document.removeEventListener("click", click, true);
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, []);

  return createPortal(
    <>
      <button
        ref={outline}
        type="button"
        tabIndex={-1}
        aria-label={highlight ? `Select ${agentTargetLabel(highlight.target)}` : "Select a report element"}
        onClick={() => highlight && onPick(highlight.target)}
        className="pointer-events-none fixed z-50 rounded-lg border-2 border-primary bg-primary/5 ring-4 ring-primary/15 outline-none"
        style={
          highlight
            ? {
                left: highlight.rect.left,
                top: highlight.rect.top,
                width: highlight.rect.width,
                height: highlight.rect.height,
              }
            : { width: 0, height: 0, opacity: 0 }
        }
      />
      <div
        ref={banner}
        className="fixed inset-x-3 bottom-4 z-50 mx-auto flex max-w-xl items-center gap-3 rounded-lg border bg-popover p-3 text-popover-foreground shadow-md"
        role="region"
        aria-label="Pick a report element"
      >
        <MousePointer2 aria-hidden className="size-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p role="status" className="text-sm font-medium break-words">
            {missed
              ? "That area isn't selectable. Try a report control, chart, or card."
              : highlight
                ? agentTargetLabel(highlight.target)
                : "Pick an element"}
          </p>
          <p className="text-xs text-muted-foreground">
            <span className="pointer-coarse:hidden">
              Click to select. Tab to browse, Enter to select, Esc to cancel.
            </span>
            <span className="hidden pointer-coarse:inline">Tap to select. Scroll to reach more elements.</span>
          </p>
        </div>
        <Button ref={cancel} type="button" variant="ghost" size="sm" onClick={onCancel}>
          <X aria-hidden /> Cancel
        </Button>
      </div>
    </>,
    document.body,
  );
}
