import { appConfig } from "@/app.config";
import { ChartNoAxesColumnIncreasing } from "lucide-react";

/**
 * The configured logo, or the app mark and name. A custom logo fits a 32px
 * slot; the default mark also identifies the app when navigation collapses.
 */
export function AppName() {
  if (appConfig.logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a small local logo; next/image adds nothing here
      <img
        src={appConfig.logo.src}
        alt={appConfig.logo.alt}
        className="h-8 w-auto max-w-full object-contain object-left group-data-[collapsible=icon]:hidden"
      />
    );
  }
  return (
    <div className="flex min-w-0 items-center gap-2.5" title={appConfig.name}>
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
      >
        <ChartNoAxesColumnIncreasing className="size-5" />
      </span>
      <span className="truncate font-display text-lg font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
        {appConfig.name}
      </span>
    </div>
  );
}
