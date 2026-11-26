"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { useReportNavigation } from "@/components/shell/report-navigation";

/** Where this server page sits among the matching products, and links to its neighbors. */
export function ProductPager({
  first,
  last,
  matched,
  bound,
  previous,
  next,
}: {
  first: number;
  last: number;
  /** Matching products, formatted on the server. */
  matched: string;
  /** The most rows the explorer pages through, when more products match. */
  bound: number | null;
  previous: string | null;
  next: string | null;
}) {
  const { go } = useReportNavigation();
  const link = (href: string, label: string) => (
    <Link
      prefetch={false}
      href={href}
      className={buttonVariants({ variant: "outline", size: "sm" })}
      onClick={(event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        go(href);
      }}
    >
      {label}
    </Link>
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span aria-live="polite" aria-atomic="true">
        {`${first}–${last} of ${matched}`}
        {bound !== null && `. Pages reach the top ${bound}; search to find the rest.`}
      </span>
      {previous && link(previous, "Previous")}
      {next && link(next, "Next")}
    </div>
  );
}
