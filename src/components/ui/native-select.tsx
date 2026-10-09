"use client";

import type { ComponentProps } from "react";
import { inputStyles } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useHydrated } from "@/hooks/use-hydrated";

/** JS-driven choices become interactive only once their change handlers are attached. */
export function NativeSelect({ className, inert, onChange, ...props }: ComponentProps<"select">) {
  const hydrated = useHydrated();
  return (
    <select
      data-slot="native-select"
      className={cn(inputStyles, "pr-2 inert:opacity-50", className)}
      {...props}
      onChange={onChange}
      // `disabled` would drop this value from a form submitted before hydration.
      inert={inert || (Boolean(onChange) && !hydrated)}
    />
  );
}
