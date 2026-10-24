"use client";

/**
 * The navigation, rendered from app.config.ts. On narrow screens the shadcn
 * sidebar becomes a sheet opened from the top bar.
 */
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { appConfig } from "@/app.config";
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

/**
 * Filters every view shares; carrying them keeps the same store and dates when
 * switching views. Report-specific filters stay with their report: a sidebar
 * link starts the destination report fresh, while supporting detail links inside
 * a report (lib/drill-down.ts) carry a compatible investigation across.
 */
const SHARED_FILTERS = ["store", "from", "to", "compare", "compare2"];

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
      <SidebarHeader className="px-3 py-4">
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
      {appConfig.showSourceMediumAttribution && (
        <SidebarFooter className="px-4 py-3 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
          Built on SourceMedium
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
