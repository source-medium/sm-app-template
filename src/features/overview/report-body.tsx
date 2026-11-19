"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** The report and its fragment targets arrive together, after the page shell streams. */
export function OverviewReportBody({ children }: { children: ReactNode }) {
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const report = body.current;
    const bar = document.getElementById("report-top-bar");
    if (!report || !bar) return;
    const measure = () => report.style.setProperty("--report-top-bar-height", `${bar.offsetHeight}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);

    const target = document.getElementById(location.hash.slice(1));
    if (target && report.contains(target)) {
      const disclosure = target.closest("details");
      if (disclosure) disclosure.open = true;
      target.scrollIntoView();
    }
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={body} className="flex flex-col gap-6 [&_[id]]:scroll-mt-(--report-top-bar-height)">
      {children}
    </div>
  );
}
