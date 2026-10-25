/** The first three products from the existing ranking, with the same already-formatted values. */
export function ProductGallery({
  products,
  measure,
}: {
  products: { key: string; label: string; image: React.ReactNode; value: string }[];
  measure: string;
}) {
  return (
    <section
      aria-label="Leading products"
      className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-5 border-y py-5"
    >
      {products.slice(0, 3).map((product, index) => (
        <div key={product.key} className="flex min-w-0 items-center gap-3">
          {product.image}
          <div className="min-w-0 wrap-anywhere">
            <p className="text-xs text-muted-foreground">Rank {index + 1}</p>
            <h2 className="mt-1 text-sm font-medium">{product.label}</h2>
            <p className="mt-1 text-lg font-semibold tabular-nums">{product.value}</p>
            <p className="text-xs text-muted-foreground">{measure}</p>
          </div>
        </div>
      ))}
    </section>
  );
}
