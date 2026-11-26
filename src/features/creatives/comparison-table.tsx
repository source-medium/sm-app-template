import { CardImage } from "@/components/patterns/card-image";
import type { GridCard } from "@/components/patterns/card-grid";
import { CHANGE_TONE_CLASS } from "@/components/patterns/change-tone";
import { MediaPreview } from "@/components/patterns/media-preview";
import { Expand } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type ComparisonCard = GridCard & { creativeId: string };

function ComparisonPreview({ card, duplicate }: { card: ComparisonCard; duplicate: boolean }) {
  const thumbnail = card.imageUrl ?? card.media?.find((item) => item.kind === "video")?.poster;
  const thumbnailFallback = card.imageUrl ? card.imageFallbackUrl : null;
  if (!card.media?.length && !card.body && !card.callToAction && !card.caption && !card.tags?.length) return null;
  return (
    <Sheet>
      <SheetTrigger
        type="button"
        aria-label={`Preview ${card.title}, ${card.badge}${duplicate ? `, ${card.creativeId}` : ""}`}
        className="mb-2 flex min-h-9 w-full cursor-pointer flex-col items-start justify-center gap-1 rounded-md text-left text-xs font-medium hover:text-primary focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11"
      >
        {thumbnail && (
          <span
            aria-hidden
            className="relative grid aspect-[4/3] max-h-48 w-full place-items-center overflow-hidden rounded-md bg-muted"
          >
            <CardImage
              src={thumbnail}
              fallbackSrc={thumbnailFallback}
              alt=""
              fallback={card.badgeMark}
              className="absolute inset-0 size-full object-contain"
            />
          </span>
        )}
        <span className="inline-flex min-h-6 items-center gap-1 underline underline-offset-2">
          <Expand aria-hidden className="size-3.5" /> Preview
        </span>
      </SheetTrigger>
      <SheetContent className="w-full gap-0 sm:max-w-3xl">
        <SheetHeader className="border-b pr-14">
          <SheetTitle>{card.title}</SheetTitle>
          <SheetDescription>
            {card.badge}
            {duplicate && ` · ${card.creativeId}`}
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 space-y-3 overflow-y-auto p-3 sm:p-5">
          {card.media?.length ? (
            <MediaPreview
              items={card.media}
              title={card.title}
              frameClassName="aspect-square max-h-[65dvh] sm:aspect-[4/3]"
              fallback={<span className="m-auto text-sm text-muted-foreground">Image unavailable</span>}
            />
          ) : null}
          {card.body && <p>{card.body}</p>}
          {card.callToAction && <p className="text-sm">{card.callToAction}</p>}
          {card.tags?.length ? (
            <p className="text-sm text-muted-foreground">{card.tags.map((tag) => tag.label).join(" · ")}</p>
          ) : null}
          {card.caption && <p className="text-sm text-muted-foreground">{card.caption}</p>}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function CreativeComparisonTable({ cards }: { cards: ComparisonCard[] }) {
  const measures = cards[0]?.metrics ?? [];
  return (
    <Table
      regionLabel="Selected creatives"
      containerClassName="rounded-xl border bg-card"
      className="table-fixed [&_tr>:first-child]:min-w-0"
      style={{ minWidth: cards.length > 2 ? `${6 + cards.length * 7}rem` : undefined }}
    >
      <caption className="sr-only">Selected creatives</caption>
      <colgroup>
        <col className="w-24 sm:w-40" />
        {cards.map((card) => (
          <col key={card.id} />
        ))}
      </colgroup>
      <TableHeader className="bg-muted">
        <TableRow>
          <TableHead scope="col" className="align-bottom">
            Metric
          </TableHead>
          {cards.map((card) => {
            const duplicate = cards.some(
              (other) => other.id !== card.id && other.title === card.title && other.badge === card.badge,
            );
            return (
              <TableHead
                key={card.id}
                scope="col"
                className="px-2 py-3 align-top [overflow-wrap:anywhere] whitespace-normal sm:px-3"
              >
                <ComparisonPreview card={card} duplicate={duplicate} />
                <span className="block font-semibold">{card.title}</span>
                <span className="block text-xs font-normal text-muted-foreground">{card.badge}</span>
                {duplicate && (
                  <span className="block text-xs font-normal text-muted-foreground">{card.creativeId}</span>
                )}
              </TableHead>
            );
          })}
        </TableRow>
      </TableHeader>
      <TableBody>
        {measures.map(({ label }, index) => (
          <TableRow key={label}>
            <TableHead scope="row" className="px-2 text-xs sm:px-3 sm:text-sm">
              {label}
            </TableHead>
            {cards.map((card) => {
              const value = card.metrics[index];
              return (
                <TableCell
                  key={card.id}
                  className="px-2 text-right [overflow-wrap:anywhere] whitespace-normal tabular-nums sm:px-3"
                >
                  <span className="font-medium">{value?.display}</span>
                  {value?.change && (
                    <span
                      className={`block text-xs ${value.change.tone ? CHANGE_TONE_CLASS[value.change.tone] : "text-muted-foreground"}`}
                    >
                      {value.change.display}
                    </span>
                  )}
                </TableCell>
              );
            })}
          </TableRow>
        ))}
        <TableRow>
          <TableHead scope="row" className="px-2 text-xs sm:px-3 sm:text-sm">
            Creative details
          </TableHead>
          {cards.map((card) => (
            <TableCell key={card.id} className="px-2 align-top [overflow-wrap:anywhere] whitespace-normal sm:px-3">
              <div className="flex flex-col items-start gap-2">
                {card.footer}
                {card.action && (
                  <a href={card.action.href} target="_blank" rel="noreferrer" className="underline">
                    {card.action.label}
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                )}
              </div>
            </TableCell>
          ))}
        </TableRow>
      </TableBody>
    </Table>
  );
}
