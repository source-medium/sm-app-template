# Product

## Register

product

## Users

The App Starter is a reporting app a brand owns and runs on its own SourceMedium
warehouse. Three people use it:

- A store owner or operator checking how the business did: revenue, orders,
  marketing efficiency, products, customers and orders, against an earlier period.
- A marketer deciding where spend goes: ad platforms, campaigns and creatives,
  what is new, what is growing and what is wasting money.
- A developer, or the coding agent working for one, changing the app: adding a
  view, changing a query, restyling it.

Viewers are trusted: every viewer sees the same data, optionally limited to one
store. They read the app between other work, often on a phone, and want the
numbers before the detail.

## Product Purpose

Make the first useful SourceMedium data app easy, and keep it easy to change. Each
view answers one business question from SourceMedium's published tables with the
catalog's metric definitions, and shows where its numbers come from. Without
configuration it runs on clearly labeled sample data, so the app is useful before
anything is connected.

Success looks like:

- A viewer reads the headline numbers first, then the detail, without learning
  table names.
- Every number says what it is compared with, and a change reads as good, bad or
  neither by the measure's meaning, never by its direction alone.
- A marketer can find the creatives that carry spend, the ones that just launched
  and the formats that work, and drill from a summary to the creative.
- Someone who wants a change knows how to make it: the composer writes the
  request, and a hosted app says where its code lives and what to do first.
- Removing a view or rebranding the app is a small, documented change.

## Product Model

Store -> Date range -> View -> Section -> Measure.

| Term          | Meaning                                                                   | Viewer usage                                   |
| ------------- | ------------------------------------------------------------------------- | ---------------------------------------------- |
| Store         | A storefront in the warehouse, named from `dim_stores`.                   | Store switcher, All stores.                    |
| View          | One page in the sidebar answering one question.                           | Overview, Creatives, Orders, Retention.        |
| Compare with  | The earlier period a change is measured against; a second one is allowed. | "Previous period", "Same period last year".    |
| Sales channel | Where an order was sold (Online DTC, Amazon, Retail, Wholesale).          | Channel filter and breakdowns.                 |
| Ad platform   | The platform that delivered an ad (Meta, Google, TikTok).                 | Paid marketing and Creatives filters.          |
| Creative      | One ad creative on one platform, with its format and first day of spend.  | Creative cards, "New", "Running since".        |
| Sample data   | Deterministic example rows shown until a warehouse is connected.          | The "Sample data" chip; never mixed with live. |
| Vibe code     | The composer that turns a request into a prompt for a coding agent.       | Top bar button and its panel.                  |

## Brand Personality

Clear, exact and calm. The app should read like a well-made business report: it
states what happened, shows the numbers that prove it and gets out of the way. It
carries SourceMedium's identity lightly, so the brand that owns it can make it
theirs.

## Anti-references

Avoid:

- Dashboard walls: many equal cards with no answer and no order of importance.
- Decorative charts, gradients, glows, oversized hero numbers or icon-per-heading
  layouts that add nothing the words do not say.
- Raw table names, column keys or warehouse errors in the default view.
- A change colored only by its sign: a rise in cost or spend is not good news.
- Controls loose between sections, or repeated dates, currency and sample status
  on every card.
- Marketing copy inside the app, and chat-style "ask anything" boxes.
- Guessed labels for values the app does not know; show those as stored.

## Design Principles

1. Lead with the numbers.
   KPIs first, then the detail. No summary sentences restating the numbers.
   Totals come from their own query, never from a truncated list.

2. Every comparison is explicit.
   Name the period compared with, show the signed change, and color it by the
   measure's declared polarity (higher, lower or neutral).

3. Use the words a store owner would.
   Channel and platform display names, not keys; explanations live in "About
   these numbers" and "About this data".

4. Each control sits with what it changes.
   Report filters first in the report; a section's own controls in its header.

5. Say each thing once.
   The shell owns dates, sample status, currency and load time.

6. Keep it easy to change.
   Copy the closest view, use the shared patterns and tokens, and keep each
   example view removable.
