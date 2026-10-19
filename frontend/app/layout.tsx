import type { Metadata, Viewport } from "next";
import "@fontsource-variable/fraunces/full.css";
import "@fontsource-variable/plus-jakarta-sans";
import "./globals.css";
import ChatWidget from "@/components/ChatWidget";
import Toaster from "@/components/Toaster";
import { BRAND } from "@/lib/brand";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  title: `${BRAND.name} · ${BRAND.tagline}`,
  description: "Turn assignments, exams and to-dos into a day-by-day study plan that updates itself — with an assistant that can add, plan and tick things off for you.",
  icons: {
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><circle cx='50' cy='50' r='48' fill='%23071739'/><path d='M60 22A30 30 0 1 0 78 72 25 25 0 0 1 60 22Z' fill='%23E3C39D'/></svg>",
  },
};

export const viewport: Viewport = {
  themeColor: "#071739",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="font-sans">
        {children}
        <ChatWidget />
        <Toaster />
      </body>
    </html>
  );
}
