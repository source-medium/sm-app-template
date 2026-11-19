# Design

## Source Of Truth

This file describes the App Starter's visual and interaction direction. It is
derived from `PRODUCT.md`, `src/styles/tokens.css`, the primitives in
`src/components/ui` and the patterns in `src/components/patterns`. `PRODUCT.md`
owns product direction; `AGENTS.md` owns the coding rules (data functions, SQL,
formatting, how to add a view). When they disagree, fix the code to match
`AGENTS.md` and this file, not the other way round.

## Register

A product UI: authenticated reporting views a store owner or marketer reads
between other work, on a desktop or a phone.

## Visual Strategy

- Quiet, light surfaces (`bg-background` behind `bg-card`), with a full dark
  theme. Appearance follows the system until the viewer picks Light or Dark.
- SourceMedium purple (`primary`) for the one primary action and the current
  navigation item; navy for the sidebar's identity. Color otherwise means state
  or a chart series, never decoration.
- Hierarchy from type size, weight and spacing, not from boxes. Cards hold
  repeated items (KPIs, creatives) and framed tools (charts, tables).

## Color

All colors come from `src/styles/tokens.css` through theme classes
(`bg-card`, `text-muted-foreground`, `border-border`, `text-success`,
`text-destructive`, `bg-warning-soft`). No raw color values in components.

- A change is signed text. It is `text-success` when the measure moved the way
  its declared polarity calls good, `text-destructive` when bad, and plain when
  the measure is neutral (spend, counts of things). The sign stays in the text,
  so color is never the only cue (`patterns/change-tone.ts`).
- Muted text is for secondary facts (captions, "Running since"), never for the
  answer or an instruction.
- Warning surfaces mark something the viewer can fix in the controls; a failed
  load uses the default error tone.
- Charts use `--chart-1` to `--chart-8` in order. A comparison period is drawn
  dashed behind the selected period on the same scale, and legends draw line
  series as strokes, dashed where the series is.
- The cohort matrix shades ages after Month 0 continuously from their lowest to
  their highest value, so equal values match; Month 0, the acquisition month,
  anchors each row unshaded.

## Typography

- System sans (`--font-sans`) for headings, body, labels and numbers.
- The display serif (`--font-display`) sets the app's name in the sidebar and
  nothing else.
- One `h1` per view, from the report header. Section titles use
  `patterns/section-header`; no display-size headings inside cards or tables.
- Numbers are tabular where they line up in columns and are formatted on the
  server (`src/lib/format.ts`): money with the report's currency (money axes
  too, as "$12K"), percents, changes and multiples with two decimals so a
  column lines up, shares as whole percents ("under 1%" for small ones),
  platform conversions with two decimals, dates with their year when the range
  spans years.
- Copy is short and specific. Button labels are a verb and an object.

## Layout

- The shell: a sidebar of views grouped by job (Business, Marketing, Sales,
  Reference) with the theme control, a top bar (navigation toggle, Vibe code,
  the sample or live chip) and one report column.
- A report reads top to bottom: its header (the view's `h1` and its three
  actions: About this data, refresh, Share), the filter bar (store, dates,
  comparisons, the view's own filters), the comparison switch, KPI cards, then
  sections, each with its own `SectionHeader`.
- KPI rows wrap from three or four across to two, then one on a phone; a row of
  six stays two across on a phone so its numbers fit about one screen. A card
  grid (creatives) is for browsing like items; a table is for comparing rows.
- Tables and charts scroll inside their own frame when they must; the page never
  scrolls sideways at desktop or phone width. An edge with more rows or columns
  beyond it is shaded (`--scroll-cue`), and the pinned header and first column
  cast that shade over what scrolls under them. Long names, URLs and IDs wrap or
  truncate with their full text available.
- Segmented switches (the comparison switch, Chart / Table) raise the selected
  option on `--segment`, lighter than the muted track in both themes.
- No nested cards, no floating decorative panels, no empty hero space.

## Components

Primitives in `src/components/ui` (shadcn, copied and editable): `Button`,
`Card`, `Table`, `Sheet`, `Popover`, `DropdownMenu`, `Disclosure`, `Skeleton`,
`Tooltip`, `NativeSelect`, `Input`, `Textarea`.

Patterns in `src/components/patterns` own report behavior: `KpiCard` with
`kpiDelta` deltas, `DataTable` with `changeCell`, `CardGrid`, `DataRegion` and
the data states (loading, empty, error, incompatible schema), `SectionHeader`,
`ComparisonCaption`, `BaselineSwitch`, `RankedBreakdown`,
`CohortMatrix` and the filters. Charts are `charts/chart-card` and
`charts/metric-chart`, each with a table view.

Use a pattern before writing markup; add a variant only when a view needs a
different behavior, not a different look.

## Report Rules

- Lead with the KPIs, then detail. No summary sentences that restate the
  numbers.
- Every compared number names its baseline once per section
  (`ComparisonCaption`) and shows the active comparison's change. KPI cards show
  every comparison as numbers; the switch above them ("Charts and tables vs")
  picks the one every chart and table draws, KPI sparklines included.
- Explanations go in `Disclosure variant="note"` at the end of the section they
  explain. Keep on screen only what changes how a number reads.
- Values the app does not know show as stored; a missing value is a dash
  (`EMPTY_VALUE`), never zero.
- Creative cards lead with the image, then the creative's name, platform and
  format, then spend and its change, then results. "New" marks a creative whose
  first spend falls in the selected dates.
- Icons only where they say something the words do not.

## Motion

Functional only: short transitions on hover, focus and sheet entry. No
page-load choreography. Respect the reduced-motion preference.
