"use client";

/**
 * The order detail drawer. Its open state is the URL (?order=), so a detail
 * view can be linked and the back button closes it. The content is rendered
 * on the server and passed in.
 */
import { useRouter } from "next/navigation";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export function OrderDrawer({
  title,
  closeHref,
  returnHref,
  children,
}: {
  title: string;
  closeHref: string;
  returnHref: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  return (
    <Sheet open onOpenChange={(open) => !open && router.push(closeHref, { scroll: false })}>
      <SheetContent
        className="w-full overflow-y-auto sm:max-w-md"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const origin = [...document.querySelectorAll<HTMLAnchorElement>("a[href]")].find(
            (link) => link.getAttribute("href") === returnHref,
          );
          (origin ?? document.getElementById("orders-heading"))?.focus({ preventScroll: true });
        }}
      >
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>Purchase, payment, and customer details for the selected order.</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
