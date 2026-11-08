"use client";

import { useState } from "react";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { useHydrated } from "@/hooks/use-hydrated";
import { setPreferenceCookie } from "@/lib/preference-cookie";
import { parseTheme, THEME_COOKIE, type Theme } from "@/lib/theme";

const appearances = {
  light: { label: "Light", icon: SunIcon },
  dark: { label: "Dark", icon: MoonIcon },
  system: { label: "System", icon: MonitorIcon },
} satisfies Record<Theme, { label: string; icon: typeof SunIcon }>;

/**
 * A once-in-a-while preference, so it sits in the sidebar footer rather than
 * the top bar. The icon is what the page shows now (System resolves to light
 * or dark through the same `dark:` variant as the page); the menu names the choice.
 */
export function ThemeControl({ initialTheme }: { initialTheme: Theme }) {
  const hydrated = useHydrated();
  const [theme, setTheme] = useState(initialTheme);
  const { label } = appearances[theme];

  function chooseTheme(value: string) {
    const next = parseTheme(value);
    document.documentElement.dataset.theme = next;
    setPreferenceCookie(THEME_COOKIE, next, next === "system" ? 0 : 31536000);
    setTheme(next);
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton aria-label={`Appearance: ${label}`} title={`Appearance: ${label}`} disabled={!hydrated}>
              <SunIcon aria-hidden className="dark:hidden" />
              <MoonIcon aria-hidden className="hidden dark:block" />
              <span>Appearance</span>
              <span className="ml-auto text-xs text-muted-foreground">{label}</span>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" aria-label="Appearance">
            <DropdownMenuRadioGroup value={theme} onValueChange={chooseTheme}>
              {Object.entries(appearances).map(([value, { label, icon: OptionIcon }]) => (
                <DropdownMenuRadioItem key={value} value={value}>
                  <OptionIcon aria-hidden="true" />
                  {label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
