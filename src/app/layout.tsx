import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Shell } from "@/components/shell";
import { AUTHOR } from "@/lib/site";
import { SPA } from "@/lib/spa-flag";
import { DEFAULT_THEME, THEME_COLORS, THEME_INIT_SCRIPT } from "@/lib/theme";
import { SpaFrame } from "@/spa/SpaApp";

export const metadata: Metadata = {
  title: { default: "QuikFly — All in One Super App", template: "%s" },
  description: "Bike taxi, car rides, bus tickets, tour packages, car rentals and travel rentals — all in one app.",
  authors: [{ name: AUTHOR.name, url: AUTHOR.url }],
  creator: AUTHOR.name,
};

export const viewport: Viewport = { themeColor: THEME_COLORS[DEFAULT_THEME], width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme={DEFAULT_THEME} suppressHydrationWarning>
      <head>
        {/* Sets the saved or system theme before first paint. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=Outfit:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans min-h-screen">{SPA ? <SpaFrame>{children}</SpaFrame> : <Shell>{children}</Shell>}</body>
    </html>
  );
}
