import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import { Toaster } from "sonner";
import { Providers } from "./providers";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/brand";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

// VERCEL_PROJECT_PRODUCTION_URL is Vercel's stable production domain (unlike
// VERCEL_URL, which changes per-deployment) — falls back to localhost so
// `npm run dev` and any non-Vercel environment still resolve absolute URLs
// for the OG/Twitter image tags below.
const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: PRODUCT_NAME,
  description: PRODUCT_TAGLINE,
  openGraph: {
    title: PRODUCT_NAME,
    description: PRODUCT_TAGLINE,
    siteName: PRODUCT_NAME,
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: PRODUCT_NAME,
    description: PRODUCT_TAGLINE,
  },
  robots: {
    // Internal tool with no public content — real credentials sit behind
    // /login, but there's no reason to let it get indexed either.
    index: false,
    follow: false,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${GeistSans.variable} font-sans antialiased`}>
        <Providers>
          {children}
          <Toaster theme="dark" position="top-right" richColors />
        </Providers>
      </body>
    </html>
  );
}
