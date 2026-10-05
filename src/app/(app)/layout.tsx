/**
 * The shell for every view. Resolves the viewer once per request: a
 * configuration error replaces the whole app with its explanation, and the
 * mode chip and viewer email come from the same decision the data reads use.
 */
import { ConfigErrorScreen } from "@/components/shell/config-error";
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
  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <TopBar mode={access.mode} viewer={access.viewer} />
          <div className="mx-auto w-full max-w-7xl p-4 sm:p-6">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
