/** A per-browser preference; the server reads it so reloads paint the chosen theme immediately. */
export const THEME_COOKIE = "sm-theme";
export type Theme = "light" | "dark" | "system";

export function parseTheme(value: string | undefined): Theme {
  return value === "light" || value === "dark" ? value : "system";
}
