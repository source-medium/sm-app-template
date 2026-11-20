"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** The report and its fragment targets arrive together, after the page shell streams. */
export function AnchoredReportBody({
  children,
  navigationKey,
  defaultFragment,
}: {
  children: ReactNode;
  navigationKey?: string;
  defaultFragment?: string;
}) {
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const report = body.current;
    const bar = document.getElementById("report-top-bar");
    if (!report || !bar) return;
    const measure = () => report.style.setProperty("--report-top-bar-height", `${bar.offsetHeight}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);

    return () => observer.disconnect();
  }, []);

  // A same-page link into a closed <details> opens it before the browser scrolls there; only Chromium does that itself.
  useEffect(() => {
    const report = body.current;
    if (!report) return;
    const reveal = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a[href^='#']") : null;
      const target = link instanceof HTMLAnchorElement ? document.getElementById(link.hash.slice(1)) : null;
      const disclosure = target && report.contains(target) ? target.closest("details") : null;
      if (disclosure) disclosure.open = true;
    };
    report.addEventListener("click", reveal);
    return () => report.removeEventListener("click", reveal);
  }, []);

  useEffect(() => {
    const fragment = location.hash.slice(1);
    const target =
      (fragment && document.getElementById(fragment)) || (defaultFragment && document.getElementById(defaultFragment));
    if (target && body.current?.contains(target)) {
      const disclosure = target.closest("details");
      if (disclosure) disclosure.open = true;
      target.scrollIntoView({ block: target.hasAttribute("data-scroll-nearest") ? "nearest" : "start" });
      target.focus({ preventScroll: true });
    }
  }, [navigationKey, defaultFragment]);
  return (
    <div ref={body} className="flex flex-col gap-6 [&_[id]]:scroll-mt-(--report-top-bar-height)">
      {children}
    </div>
  );
}
