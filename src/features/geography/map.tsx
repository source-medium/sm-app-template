"use client";
import { lazy, Suspense, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MapProps } from "./map-shapes";
const Shapes = lazy(() => import("./map-shapes"));
/** Mobile stays table-first and loads geometry only when requested. Desktop loads it in this feature alone. */
export function GeographyMap(props: MapProps) {
  const desktop = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
  const [chosen, setChosen] = useState<boolean | null>(null);
  const shown = chosen ?? desktop;
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>Shipping destinations</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button variant="outline" size="sm" onClick={() => setChosen(!shown)}>
          {shown ? "Hide map" : "Show map"}
        </Button>
        {shown && (
          <Suspense fallback={<p role="status">Loading local map…</p>}>
            <Shapes {...props} />
          </Suspense>
        )}
        <p className="text-sm text-muted-foreground">
          Darker fill indicates more valid orders. No matching orders use an outline. Negative revenue remains signed in
          the table. Select a destination in the map or table.
        </p>
        <p className="text-xs text-muted-foreground">
          Natural Earth 5.1.1, public domain. Simplified de facto boundaries; small or unmapped destinations remain in
          the table. {props.country === "US" && "Alaska and Hawaii are shown in separately scaled insets."}
        </p>
      </CardContent>
    </Card>
  );
}
const query = "(min-width: 1024px)";
const subscribe = (callback: () => void) => {
  const media = window.matchMedia(query);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
};
