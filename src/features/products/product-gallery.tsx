import Link from "next/link";

/** The first three products from the existing ranking, with the same already-formatted values. */
export function ProductGallery({
  products,
  measure,
}: {
  products: { key: string; label: string; image: React.ReactNode; value: string; href?: string }[];
  measure: string;
}) {
  return (
    <section
      aria-label="Leading products"
      className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-5 border-y py-5"
    >
      {products.slice(0, 3).map((product, index) => {
        const content = (
          <>
            {product.image}
            <div className="min-w-0 wrap-anywhere">
              <p className="text-xs text-muted-foreground">Rank {index + 1}</p>
              <h2 className="mt-1 text-sm font-medium group-hover:underline">{product.label}</h2>
              <p className="mt-1 text-lg font-semibold tabular-nums">{product.value}</p>
              <p className="text-xs text-muted-foreground">{measure}</p>
            </div>
          </>
        );
        const className =
          "group flex min-w-0 items-center gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring";
        return product.href ? (
          <Link key={product.key} prefetch={false} href={product.href} className={className}>
            {content}
          </Link>
        ) : (
          <div key={product.key} className={className}>
            {content}
          </div>
        );
      })}
    </section>
  );
}
