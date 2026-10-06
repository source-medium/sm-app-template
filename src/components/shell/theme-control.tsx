"use client";

import { useId, useState } from "react";
import { SunMoon } from "lucide-react";
import { NativeSelect } from "@/components/ui/native-select";
import { parseTheme, THEME_COOKIE, type Theme } from "@/lib/theme";

export function ThemeControl({ initialTheme }: { initialTheme: Theme }) {
  const id = useId();
  const [theme, setTheme] = useState(initialTheme);

  function chooseTheme(value: string) {
    const next = parseTheme(value);
    document.documentElement.dataset.theme = next;
    document.cookie = `${THEME_COOKIE}=${next}; Path=/; Max-Age=${next === "system" ? 0 : 31536000}; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
    setTheme(next);
  }

  return (
    <label htmlFor={id} className="flex items-center gap-2 text-muted-foreground">
      <SunMoon className="hidden size-4 sm:block" aria-hidden />
      <span className="sr-only">Appearance</span>
      <NativeSelect
        id={id}
        value={theme}
        onChange={(event) => chooseTheme(event.currentTarget.value)}
        className="w-auto"
      >
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="system">System</option>
      </NativeSelect>
    </label>
  );
}
