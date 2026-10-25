"use client";

import { useState } from "react";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useHydrated } from "@/hooks/use-hydrated";
import { setPreferenceCookie } from "@/lib/preference-cookie";
import { parseTheme, THEME_COOKIE, type Theme } from "@/lib/theme";

const appearances = {
  light: { label: "Light", icon: SunIcon },
  dark: { label: "Dark", icon: MoonIcon },
  system: { label: "System", icon: MonitorIcon },
} satisfies Record<Theme, { label: string; icon: typeof SunIcon }>;

export function ThemeControl({ initialTheme }: { initialTheme: Theme }) {
  const hydrated = useHydrated();
  const [theme, setTheme] = useState(initialTheme);
  const { label, icon: Icon } = appearances[theme];

  function chooseTheme(value: string) {
    const next = parseTheme(value);
    document.documentElement.dataset.theme = next;
    setPreferenceCookie(THEME_COOKIE, next, next === "system" ? 0 : 31536000);
    setTheme(next);
  }

  return (
    <DropdownMenu modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={`Appearance: ${label}`}
              disabled={!hydrated}
            >
              <Icon aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Appearance: {label}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" aria-label="Appearance">
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
  );
}
