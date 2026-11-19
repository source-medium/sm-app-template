import { adPlatformMark } from "@/lib/ad-platforms";
import { cn } from "@/lib/utils";

/**
 * An ad platform's mark, always beside its name: it helps a row or card be recognized at a glance and
 * says nothing the name does not. Nothing renders for a platform without a mark.
 */
export function PlatformMark({ platform, className }: { platform: string; className?: string }) {
  const src = adPlatformMark(platform);
  if (!src) return null;
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-sm border bg-mark-ground",
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a small local mark; next/image adds nothing here */}
      <img src={src} alt="" className="size-[70%] object-contain" />
    </span>
  );
}
