/**
 * A responsive grid of cards: an optional image, a text block, and a small
 * row of metrics. The image slot owns its load-failure fallback, so a card
 * never shows a broken image.
 */
import { Card, CardContent, cardGridStyles } from "@/components/ui/card";
import { CardImage } from "./card-image";

export type GridCard = {
  id: string;
  title: string;
  body: string | null;
  badge: string | null;
  imageUrl: string | null;
  metrics: { label: string; display: string }[];
  action?: { href: string; label: string };
};

export function CardGrid({ cards, label }: { cards: GridCard[]; label: string }) {
  return (
    <ul data-agent-target={label} data-agent-component="CardGrid" aria-label={label} className={cardGridStyles}>
      {cards.map((card, index) => (
        <li key={card.id} data-agent-item={index + 1} className="min-w-0">
          <Card className="h-full gap-0 overflow-hidden py-0">
            {card.imageUrl ? (
              <CardImage src={card.imageUrl} alt={card.title} fallback={<TextPanel card={card} />} />
            ) : (
              <TextPanel card={card} />
            )}
            <CardContent className="flex flex-1 flex-col gap-3 p-4">
              <div className="flex flex-col gap-1">
                {card.badge && (
                  <span className="text-xs font-medium text-muted-foreground uppercase">{card.badge}</span>
                )}
                <h3 className="line-clamp-2 font-medium">{card.title}</h3>
              </div>
              <dl className="mt-auto grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {card.metrics.map((metric) => (
                  <div key={metric.label} data-agent-element={metric.label} className="flex min-w-0 flex-col">
                    <dt className="text-xs text-muted-foreground">{metric.label}</dt>
                    <dd className="font-medium tabular-nums">{metric.display}</dd>
                  </div>
                ))}
              </dl>
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

/** The text card: what shows when there is no image or it failed to load. */
function TextPanel({ card }: { card: GridCard }) {
  return (
    <div className="flex aspect-square w-full items-center bg-accent p-6 text-accent-foreground">
      <p className="line-clamp-[8] text-sm leading-relaxed">{card.body ?? card.title}</p>
    </div>
  );
}
