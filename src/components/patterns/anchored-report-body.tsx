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
