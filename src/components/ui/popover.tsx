"use client";

import type { ComponentProps } from "react";
import { Popover as Primitive } from "radix-ui";
import { cn } from "@/lib/utils";

export const Popover = Primitive.Root;
export const PopoverTrigger = Primitive.Trigger;

export function PopoverContent({ className, sideOffset = 8, ...props }: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        sideOffset={sideOffset}
        className={cn(
          "z-50 rounded-lg border bg-popover text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0",
          className,
        )}
        {...props}
      />
    </Primitive.Portal>
  );
}
