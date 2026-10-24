"use client";
import { lazy, Suspense, type ComponentType } from "react";
export type MapProps = {
  country: string | null;
  locations: { code: string; label: string; orders: string; href?: string; intensity: number }[];
};
type Geometry = { viewBox: string; paths: Record<string, string> };
function GeometryView({ geometry, locations }: { geometry: Geometry } & MapProps) {
  const data = new Map(locations.map((row) => [row.code, row]));
  return (
    <svg
      viewBox={geometry.viewBox}
      className="h-auto w-full"
      role="group"
      aria-label="Shipping destination map. Equivalent links are in the ranked table."
    >
      <defs>
        <pattern id="map-no-data" width="6" height="6" patternUnits="userSpaceOnUse">
          <path d="M0 6L6 0" stroke="var(--border)" strokeWidth="0.5" />
        </pattern>
      </defs>
      {Object.entries(geometry.paths).map(([code, d]) => {
        const row = data.get(code);
        const path = (
          <path
            d={d}
            fill={row && row.orders !== "0" ? "var(--chart-1)" : "url(#map-no-data)"}
            fillOpacity={row && row.orders !== "0" ? 0.25 + row.intensity * 0.75 : 1}
            stroke="var(--muted-foreground)"
            strokeWidth="0.45"
          />
        );
        return row?.href ? (
          <a
            key={code}
            href={row.href}
            aria-label={`${row.label}: ${row.orders} valid orders`}
            className="focus:outline-2 focus:outline-ring"
          >
            <title>
              {row.label}: {row.orders} valid orders
            </title>
            {path}
          </a>
        ) : (
          <g key={code}>
            <title>
              {row?.label ?? code}: {row?.orders ?? "No matching records"}
            </title>
            {path}
          </g>
        );
      })}
    </svg>
  );
}
const World: ComponentType<MapProps> = lazy(async () => {
  const geometry = (await import("./assets/countries.json")).default;
  return { default: (props: MapProps) => <GeometryView geometry={geometry} {...props} /> };
});
const States: ComponentType<MapProps> = lazy(async () => {
  const geometry = (await import("./assets/us-states.json")).default;
  return { default: (props: MapProps) => <GeometryView geometry={geometry} {...props} /> };
});
export default function MapShapes(props: MapProps) {
  return (
    <Suspense fallback={<p role="status">Loading boundaries…</p>}>
      {props.country === "US" ? <States {...props} /> : <World {...props} />}
    </Suspense>
  );
}
