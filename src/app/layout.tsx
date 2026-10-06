import type { Metadata } from "next";
import { Fraunces } from "next/font/google";
import { cookies } from "next/headers";
import { appConfig } from "@/app.config";
import { parseTheme, THEME_COOKIE } from "@/lib/theme";
import "./globals.css";

// Fraunces is open-licensed and self-hosted by next/font. Satoshi's license
// forbids redistributing its files, so it loads from Fontshare's API.
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap" });

export const metadata: Metadata = {
  title: { default: appConfig.name, template: `%s · ${appConfig.name}` },
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html lang="en" className={fraunces.variable} data-theme={theme}>
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,600,700&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
