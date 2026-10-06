"use client";

import { useState } from "react";
import { SunMoon } from "lucide-react";
import { parseTheme, THEME_COOKIE, type Theme } from "@/lib/theme";

export function ThemeControl({ initialTheme }: { initialTheme: Theme }) {
  const [theme, setTheme] = useState(initialTheme);

  function chooseTheme(value: string) {
    const next = parseTheme(value);
    document.documentElement.dataset.theme = next;
    document.cookie = `${THEME_COOKIE}=${next}; Path=/; Max-Age=${next === "system" ? 0 : 31536000}; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    setTheme(next);
  }

  return (
    <label className="flex items-center gap-2 text-muted-foreground">
      <SunMoon className="hidden size-4 sm:block" aria-hidden />
      <span className="sr-only">Appearance</span>
      <select
        value={theme}
        onChange={(event) => chooseTheme(event.currentTarget.value)}
        className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
      >
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="system">System</option>
      </select>
    </label>
  );
}
