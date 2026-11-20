import { CardImage } from "@/components/patterns/card-image";
import type { GridCard } from "@/components/patterns/card-grid";
import { CHANGE_TONE_CLASS } from "@/components/patterns/change-tone";
import { MediaPreview } from "@/components/patterns/media-preview";
import { Disclosure } from "@/components/ui/disclosure";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type ComparisonCard = GridCard & { creativeId: string };

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
            const thumbnail = card.imageUrl ?? card.media?.find((m) => m.kind === "video")?.poster;
            const duplicate = cards.some(
              (other) => other.id !== card.id && other.title === card.title && other.badge === card.badge,
            );
            return (
              <TableHead
                key={card.id}
                scope="col"
                className="px-2 py-3 align-top [overflow-wrap:anywhere] whitespace-normal sm:px-3"
              >
                <div aria-hidden className="mb-2 grid size-10 place-items-center">
                  {thumbnail ? (
                    <CardImage
                      src={thumbnail}
                      alt=""
                      fallback={card.badgeMark}
                      className="size-10 rounded-md object-cover"
                    />
                  ) : (
                    card.badgeMark
                  )}
                </div>
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
                {card.media?.length || card.body || card.callToAction || card.caption || card.tags?.length ? (
                  <Disclosure summary="Preview" className="w-full min-w-0">
                    {card.media?.length ? <MediaPreview items={card.media} title={card.title} fallback={null} /> : null}
                    {card.body && <p className="mt-2">{card.body}</p>}
                    {card.callToAction && <p className="text-xs">{card.callToAction}</p>}
                    {card.tags?.map((tag) => (
                      <span key={tag.label} className="mr-2 text-xs">
                        {tag.label}
                      </span>
                    ))}
                    {card.caption && <p className="text-xs text-muted-foreground">{card.caption}</p>}
                  </Disclosure>
                ) : null}
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
