"use client";

import type { ComponentProps } from "react";
import { usePresentationParams } from "@/hooks/use-presentation-params";

/** A fragment may also change a report filter while keeping the other applied URL choices. */
export type ReportHref = string | { query: Record<string, string>; fragment: string };
type AnchorProps = Omit<ComponentProps<"a">, "href">;

export function ReportAnchor({ href, children, ...props }: AnchorProps & { href: ReportHref }) {
  return typeof href === "string" ? (
    <a href={href} {...props}>
      {children}
    </a>
  ) : (
    <QueryAnchor {...href} {...props}>
      {children}
    </QueryAnchor>
  );
}

function QueryAnchor({ query, fragment, children, ...props }: AnchorProps & Exclude<ReportHref, string>) {
  const params = usePresentationParams();
  for (const [key, value] of Object.entries(query)) params.set(key, value);
  return (
    <a href={`?${params}#${fragment}`} {...props}>
      {children}
    </a>
  );
}
