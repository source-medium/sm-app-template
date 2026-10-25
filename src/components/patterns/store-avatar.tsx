import { CardImage } from "./card-image";
import { cn } from "@/lib/utils";

/** The same store identity in the picker, current-store header and comparison rows. */
export function StoreAvatar({
  label,
  logoUrl,
  className,
}: {
  label: string;
  logoUrl: string | null;
  className?: string;
}) {
  const words = label.trim().split(/\s+/);
  const initials = [words[0], ...(words.length > 1 ? [words.at(-1)] : [])]
    .map((word) => Array.from(word ?? "")[0])
    .join("")
    .toUpperCase();
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-card text-xs font-semibold text-muted-foreground",
        className,
      )}
    >
      {logoUrl ? (
        <CardImage src={logoUrl} alt="" fallback={initials} className="size-full bg-card object-contain p-1" />
      ) : (
        initials
      )}
    </span>
  );
}
