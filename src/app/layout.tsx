import type { Metadata } from "next";
import { cookies } from "next/headers";
import { appConfig } from "@/app.config";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: appConfig.name, template: `%s · ${appConfig.name}` },
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="en" data-theme={theme}>
      <body>
        <noscript>
          <p className="m-4 rounded-lg border p-4 text-sm">Enable JavaScript to load reports and use their filters.</p>
        </noscript>
        {children}
      </body>
    </html>
  );
}
