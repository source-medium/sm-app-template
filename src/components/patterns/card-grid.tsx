/**
 * A responsive grid of cards: an optional image, a text block, and a small
 * row of metrics. The image slot owns its load-failure fallback, so a card
 * never shows a broken image.
 */
import { Card, CardContent, cardGridStyles } from "@/components/ui/card";
import type { ChangeTone } from "@/lib/comparison";
import { cn } from "@/lib/utils";
import { CardImage } from "./card-image";
import { CHANGE_TONE_CLASS } from "./change-tone";

import { MediaPreview, type PreviewMedia } from "./media-preview";

export type GridCard = {
  id: string;
  title: string;
  body: string | null;
  /** The ad's button text ("Shop now"), shown under the copy when the card has no image. */
  callToAction?: string;
  badge: string | null;
  /** A small mark shown before the badge, such as the ad platform's logo. */
  badgeMark?: React.ReactNode;
  /** Short facts beside the badge, such as a format or "New"; the first is emphasized when `highlight` is set. */
  tags?: { label: string; highlight?: boolean }[];
  imageUrl: string | null;
  /** Another URL for the same image, tried when `imageUrl` fails before the card falls back to text. */
  imageFallbackUrl?: string | null;
  media?: PreviewMedia[];
  /** `change` is the metric's change against the report's comparison, colored by its measure's polarity. */
  metrics: { label: string; display: string; change?: { display: string; tone: ChangeTone | null } }[];
  /** One quiet line under the title, such as when the creative first ran. */
  caption?: string;
  action?: { href: string; label: string };
  footer?: React.ReactNode;
  selected?: boolean;
};

export function CardGrid({ cards, label }: { cards: GridCard[]; label: string }) {
  return (
    <ul data-agent-target={label} data-agent-component="CardGrid" aria-label={label} className={cardGridStyles}>
      {cards.map((card, index) => (
        <li key={card.id} data-agent-item={index + 1} className="min-w-0">
          <Card className={cn("h-full gap-0 overflow-hidden py-0", card.selected && "ring-2 ring-primary")}>
            {card.media?.length && (card.media.length > 1 || card.media[0]?.kind === "video") ? (
              <MediaPreview items={card.media} title={card.title} fallback={<TextPanel card={card} />} />
            ) : card.imageUrl ? (
              <CardImage
                src={card.imageUrl}
                fallbackSrc={card.imageFallbackUrl}
                alt={card.title}
                fallback={<TextPanel card={card} />}
                // Shorter on a phone so a card's numbers stay near its image; contained, so no creative is cropped.
                className="aspect-[4/3] object-contain sm:aspect-square"
              />
            ) : (
              <TextPanel card={card} />
            )}
            <CardContent className="flex flex-1 flex-col gap-3 p-4">
              <div className="flex flex-col gap-1">
                <h3 className="line-clamp-2 font-medium">{card.title}</h3>
                {(card.badge || card.tags?.length) && (
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium text-muted-foreground uppercase">
                    {card.badge && (
                      <span className="flex items-center gap-1.5">
                        {card.badgeMark}
                        {card.badge}
                      </span>
                    )}
                    {card.tags?.map((tag) => (
                      <span
                        key={tag.label}
                        className={cn(
                          tag.highlight
                            ? "rounded-sm bg-primary px-1.5 py-0.5 text-primary-foreground"
                            : "before:mr-2 before:content-['·']",
                        )}
                      >
                        {tag.label}
                      </span>
                    ))}
                  </p>
                )}
                {card.caption && <p className="text-xs text-muted-foreground">{card.caption}</p>}
              </div>
              <dl className="mt-auto grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {card.metrics.map((metric) => (
                  <div key={metric.label} data-agent-element={metric.label} className="flex min-w-0 flex-col">
                    <dt className="text-xs text-muted-foreground">{metric.label}</dt>
                    <dd className="font-medium tabular-nums">{metric.display}</dd>
                    {metric.change && (
                      <dd
                        className={cn(
                          "text-xs tabular-nums",
                          metric.change.tone ? CHANGE_TONE_CLASS[metric.change.tone] : "text-muted-foreground",
                        )}
                      >
                        {metric.change.display}
                      </dd>
                    )}
                  </div>
                ))}
              </dl>
              {card.footer}
              {card.action && (
                <a
                  href={card.action.href}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium underline underline-offset-4"
                >
                  {card.action.label}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              )}
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}

/** The text card: what shows when there is no image or it failed to load. The copy is the creative, so it reads large. */
function TextPanel({ card }: { card: GridCard }) {
  return (
    <div className="flex aspect-[4/3] w-full items-center bg-accent p-6 text-accent-foreground sm:aspect-square">
      <div className="flex flex-col items-start gap-3">
        <p className="line-clamp-[6] text-lg leading-snug font-medium text-balance">{card.body ?? card.title}</p>
        {/* Part of the ad's copy, set in its colors, so it never reads as one of the report's own buttons. */}
        {card.callToAction && (
          <span className="border-b-2 border-current pb-0.5 text-xs font-semibold tracking-wide uppercase">
            {card.callToAction}
          </span>
        )}
      </div>
    </div>
  );
}
