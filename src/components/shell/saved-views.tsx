"use client";

import { useState } from "react";
import Link from "next/link";
import { Bookmark, X } from "lucide-react";
import { appConfig } from "@/app.config";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { readSavedReports, useSavedReports, writeSavedReports } from "@/hooks/use-saved-reports";

/**
 * Views saved from Share, listed in the sidebar because they are places to go.
 * Browser storage only: shown once a view is saved, and removing one needs no
 * confirmation because saving it again is one step.
 */
export function SavedViews({ current }: { current: string }) {
  const reports = useSavedReports();
  const [status, setStatus] = useState("");
  if (!reports.length) {
    return (
      <span aria-live="polite" className="sr-only">
        {status}
      </span>
    );
  }
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Saved views</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu aria-label="Saved views">
          {reports.map((report) => {
            const page = appConfig.nav.find((item) => report.href.split("?")[0] === item.href)?.label;
            return (
              <SidebarMenuItem key={report.id} className="group/saved">
                <SidebarMenuButton
                  asChild
                  isActive={report.href === current}
                  tooltip={page ? `${report.name} (${page})` : report.name}
                  className="pr-8"
                >
                  <Link prefetch={false} href={report.href} title={page ? `${report.name} (${page})` : report.name}>
                    <Bookmark aria-hidden />
                    <span>{report.name}</span>
                  </Link>
                </SidebarMenuButton>
                <button
                  type="button"
                  aria-label={`Remove ${report.name}`}
                  title="Remove"
                  onClick={() => {
                    // Re-read at the mutation boundary so another tab's saved views are preserved.
                    if (writeSavedReports(readSavedReports().filter((item) => item.id !== report.id)))
                      setStatus(`Removed ${report.name}.`);
                    else setStatus("Could not remove. Browser storage may be unavailable.");
                  }}
                  className="absolute top-1/2 right-1 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-0 group-focus-within/saved:opacity-100 group-hover/saved:opacity-100 group-data-[collapsible=icon]:hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring pointer-coarse:size-9 pointer-coarse:opacity-100"
                >
                  <X aria-hidden className="size-3.5" />
                </button>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
        <span aria-live="polite" className="sr-only">
          {status}
        </span>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
