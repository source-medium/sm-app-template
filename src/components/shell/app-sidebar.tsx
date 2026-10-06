"use client";

/**
 * The navigation, rendered from app.config.ts. On narrow screens the shadcn
 * sidebar becomes a sheet opened from the top bar.
 */
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { appConfig } from "@/app.config";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { AppName } from "./app-name";

/** Filters every view shares; carrying them keeps the same store and dates when switching views. */
const SHARED_FILTERS = ["store", "from", "to", "compare"];

export function AppSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const shared = new URLSearchParams();
  for (const name of SHARED_FILTERS) {
    const value = searchParams.get(name);
    if (value) shared.set(name, value);
  }
  const suffix = shared.size > 0 ? `?${shared.toString()}` : "";
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 py-4">
        <AppName />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {appConfig.nav.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                      <Link href={`${item.href}${suffix}`} aria-current={active ? "page" : undefined}>
                        <item.icon aria-hidden />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      {appConfig.showSourceMediumAttribution && (
        <SidebarFooter className="px-4 py-3 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
          Built on SourceMedium
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
