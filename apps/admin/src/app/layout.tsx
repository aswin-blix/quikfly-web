import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AdminShell } from "@/components/AdminShell";
import { SessionProvider } from "@/lib/session";
import { THEME_INIT_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  title: { default: "QuikFly Admin", template: "%s · QuikFly Admin" },
  description: "QuikFly staff panel.",
  // Staff tool: keep it out of search engines.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-sans">
        <SessionProvider>
          <AdminShell>{children}</AdminShell>
        </SessionProvider>
      </body>
    </html>
  );
}
