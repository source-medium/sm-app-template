import { appConfig } from "@/app.config";

/** The logo, or the app name set in the display face. */
export function AppName() {
  if (appConfig.logo) {
    // eslint-disable-next-line @next/next/no-img-element -- a small local logo; next/image adds nothing here
    return <img src={appConfig.logo.src} alt={appConfig.logo.alt} className="h-8 w-auto" />;
  }
  return (
    <span className="truncate font-display text-lg font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
      {appConfig.name}
    </span>
  );
}
