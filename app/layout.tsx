import { FocusOnAlert } from "@/components/focus-on-alert";
import type { Metadata, Viewport } from "next";
import "./globals.css";

// Every page reads per-request data (session, database), so never prerender at build time.
// This also keeps `next build` from opening the database.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL || "http://localhost:3000"),
  title: {
    default: "SOLARekta — Solar estimates you can actually understand",
    template: "%s · SOLARekta",
  },
  description:
    "Upload your Philippine electricity bill, get a transparent solar estimate with clear assumptions, and compare quotes from verified installers.",
  applicationName: "SOLARekta",
  keywords: ["solar Philippines", "solar estimate", "solar installer quotes", "net metering", "Meralco solar"],
  openGraph: {
    title: "SOLARekta — Solar estimates you can actually understand",
    description:
      "Transparent rooftop solar estimates for Philippine homes and small businesses, with installer quotes you can compare side by side.",
    type: "website",
    locale: "en_PH",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#12601c",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-PH">
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        {children}
        <FocusOnAlert />
      </body>
    </html>
  );
}
