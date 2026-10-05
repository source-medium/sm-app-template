"use client";

/**
 * The navigation, rendered from app.config.ts. On narrow screens the shadcn
 * sidebar becomes a sheet opened from the top bar.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
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

export function AppSidebar() {
  const pathname = usePathname();
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
                      <Link href={item.href} aria-current={active ? "page" : undefined}>
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
