import type { ComponentProps } from "react";
import { inputStyles } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** A native picker for filters that also work without JavaScript. */
export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return <select data-slot="native-select" className={cn(inputStyles, "pr-2", className)} {...props} />;
}
