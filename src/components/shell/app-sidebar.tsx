"use client";

/**
 * The navigation, rendered from app.config.ts. On narrow screens the shadcn
 * sidebar becomes a sheet opened from the top bar.
 */
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { appConfig } from "@/app.config";
import { SHARED_FILTERS } from "@/lib/filters";
import { LinkPending } from "./pending";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { AppName } from "./app-name";
import { BookOpen, ExternalLink, CodeXml } from "lucide-react";
import { SourceMediumMark } from "./source-medium-mark";
import { SOURCEMEDIUM_WEBSITE, TEMPLATE_DOCUMENTATION, TEMPLATE_REPOSITORY } from "@/lib/template";

/**
 * The sidebar carries SHARED_FILTERS, keeping the same store and dates when
 * switching views. Report-specific filters stay with their report: a sidebar
 * link starts the destination report fresh, while supporting detail links inside
 * a report (lib/drill-down.ts) carry a compatible investigation across.
 */
export function AppSidebar({ fixedStore = false }: { fixedStore?: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const shared = new URLSearchParams();
  for (const name of SHARED_FILTERS) {
    const value = searchParams.get(name);
    if (value) shared.set(name, value);
  }
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 py-4 group-data-[collapsible=icon]:px-2">
        <AppName />
      </SidebarHeader>
      <SidebarContent>
        {[...new Set(appConfig.nav.map((item) => item.group ?? "Reports"))].map((group) => (
          <SidebarGroup key={group}>
            <SidebarGroupLabel>{group}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {appConfig.nav
                  .filter((item) => (item.group ?? "Reports") === group && (!fixedStore || item.scope !== "all-stores"))
                  .map((item) => {
                    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                    const target = new URLSearchParams(shared);
                    // A report without period comparisons cannot apply one; dropping it is not a lost filter.
                    if (!item.comparisons) {
                      target.delete("compare");
                      target.delete("compare2");
                    }
                    const href = active
                      ? `${pathname}?${searchParams.toString()}`
                      : `${item.href}${target.size ? `?${target}` : ""}`;
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                          <Link prefetch={false} href={href} aria-current={active ? "page" : undefined}>
                            <item.icon aria-hidden />
                            <span>{item.label}</span>
                            <LinkPending className="ml-auto" />
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="gap-2 border-t p-2">
        <SidebarMenu aria-label="Template resources">
          {[
            { label: "Template docs", href: TEMPLATE_DOCUMENTATION, icon: BookOpen },
            { label: "Template on GitHub", href: TEMPLATE_REPOSITORY, icon: CodeXml },
          ].map(({ label, href, icon: Icon }) => (
            <SidebarMenuItem key={href}>
              <SidebarMenuButton asChild tooltip={label}>
                <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`${label} (opens in a new tab)`}>
                  <Icon aria-hidden />
                  <span>{label}</span>
                  <ExternalLink
                    aria-hidden
                    className="ml-auto size-3 text-muted-foreground group-data-[collapsible=icon]:hidden"
                  />
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
        {appConfig.showSourceMediumAttribution && (
          <a
            href={SOURCEMEDIUM_WEBSITE}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Built on SourceMedium (opens in a new tab)"
            title="Built on SourceMedium"
            className="flex min-h-11 items-center gap-2.5 rounded-md px-2 text-xs text-muted-foreground group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <SourceMediumMark className="h-6 w-5 shrink-0 text-sidebar-primary" />
            <span className="group-data-[collapsible=icon]:hidden">
              <span className="block font-medium text-sidebar-foreground">Built on SourceMedium</span>
              <span className="block">Open source app template</span>
            </span>
          </a>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
