/**
 * The shell for every view. Resolves the viewer once per request: a
 * configuration error replaces the whole app with its explanation, and the
 * mode chip and viewer email come from the same decision the data reads use.
 */
import { ConfigErrorScreen, DataAccessErrorScreen } from "@/components/shell/config-error";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { TopBar } from "@/components/shell/top-bar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConfigurationError, requireViewer, type ViewerAccess } from "@/lib/auth/require-viewer";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let access: ViewerAccess;
  try {
    access = await requireViewer();
  } catch (error) {
    if (error instanceof ConfigurationError) return <ConfigErrorScreen problems={error.problems} />;
    throw error;
  }
  // A managed app loads its data context in requireViewer(), so a refusal (app
  // paused, access changed) or an outage is explained here in place of a blank error page.
  if (access.mode === "live" && access.refusal) {
    return (
      <DataAccessErrorScreen
        title={access.refusal.title}
        remedy={access.refusal.remedy}
        requestId={access.refusal.requestId}
      />
    );
  }
  return (
    <TooltipProvider>
      <SidebarProvider>
        {/* The first focusable element: keyboard users skip the navigation and top bar. */}
        <a
          href="#report"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:border focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:outline-2 focus:outline-ring"
        >
          Skip to report
        </a>
        <AppSidebar fixedStore={access.storeId !== null} />
        <SidebarInset>
          <TopBar mode={access.mode} viewer={access.viewer} />
          {/* scroll-mt keeps the report title below the sticky top bar when the skip link scrolls to it. */}
          <div id="report" tabIndex={-1} className="mx-auto w-full max-w-7xl scroll-mt-16 p-4 outline-none sm:p-6">
            {children}
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
