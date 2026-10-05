import { appConfig } from "@/app.config";

/**
 * The logo, or the app name set in the display face. A logo replaces the
 * name; it fits a 32px-tall slot, and both hide when the sidebar collapses
 * to icons.
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
    <span className="truncate font-display text-lg font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
      {appConfig.name}
    </span>
  );
}
