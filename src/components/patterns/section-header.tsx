/**
 * A report section's title row: heading, optional description, and the
 * controls that belong to that section (a download, a grain picker). Every
 * section uses it so titles, descriptions, and actions line up the same way.
 */
export function SectionHeader({
  id,
  title,
  description,
  actions,
  headingProps,
}: {
  /** The heading's id, for `aria-labelledby` on the section. */
  id?: string;
  title: string;
  description?: React.ReactNode;
  /** Controls aligned to the end of the row. */
  actions?: React.ReactNode;
  /** Extra attributes for the heading, such as a focus target. */
  headingProps?: Omit<React.ComponentProps<"h2">, "id" | "children" | "className">;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2
          id={id}
          className="text-lg font-semibold focus-visible:outline-2 focus-visible:outline-ring"
          {...headingProps}
        >
          {title}
        </h2>
        {description && <p className="max-w-prose text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-end gap-3">{actions}</div>}
    </div>
  );
}
