/**
 * Axis ticks in the browser without locale APIs, so server and client render
 * identical text: 950, 1.2K, 3.4M. Values shown to people elsewhere are
 * formatted on the server.
 */
export function compactNumber(value: number): string {
  const sign = value < 0 ? "-" : "";
  const magnitude = Math.abs(value);
  const units: [number, string][] = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [size, suffix] of units) {
    if (magnitude >= size) return `${sign}${trim(magnitude / size)}${suffix}`;
  }
  return `${sign}${trim(magnitude)}`;
}

function trim(value: number): string {
  const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return String(rounded);
}
