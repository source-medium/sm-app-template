import * as React from "react";
import { inputStyles } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea data-slot="textarea" className={cn(inputStyles, "h-auto min-h-20 py-2", className)} {...props} />;
}

export { Textarea };
