import { Package } from "lucide-react";
import { CardImage } from "@/components/patterns/card-image";
import { cn } from "@/lib/utils";
import { Suspense } from "react";

/** All thumbnails share one catalog promise; slow catalog reads leave metrics and links available. */
export function ProductPhoto(props: {
  images: Promise<Map<string, string | null>>;
  productKey: string;
  className?: string;
}) {
  return (
    <Suspense fallback={<ProductImage src={null} className={props.className} />}>
      <ResolvedProductPhoto {...props} />
    </Suspense>
  );
}

async function ResolvedProductPhoto({ images, productKey, className }: Parameters<typeof ProductPhoto>[0]) {
  return <ProductImage src={(await images).get(productKey) ?? null} className={className} />;
}

/** A reserved image frame keeps rows steady and missing or expired photos unobtrusive. */
export function ProductImage({ src, className }: { src: string | null; className?: string }) {
  const fallback = <Package aria-hidden className="size-5 text-muted-foreground" />;
  return (
    <span
      aria-hidden
      className={cn("flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted", className)}
    >
      {src ? <CardImage src={src} alt="" fallback={fallback} className="size-full object-contain" /> : fallback}
    </span>
  );
}
