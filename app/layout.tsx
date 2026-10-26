import type { Metadata, Viewport } from "next";
import { Archivo, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { Providers } from "./providers";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/brand";

// Typography: IBM Plex Sans for UI text and figures (built for data-dense
// interfaces, unambiguous 0/O and 1/l/I), Archivo at a slightly expanded
// width for headings and hero numbers. Sizes follow golden-ratio steps —
// see fontSize in tailwind.config.ts.
const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-plex" });
const archivo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo" });

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
  // Installed on an iPhone home screen: full screen, the page's own navy
  // behind the status bar (the top bar pads itself by safe-area-inset-top).
  appleWebApp: { capable: true, title: PRODUCT_NAME, statusBarStyle: "black-translucent" },
  robots: {
    // Internal tool with no public content — real credentials sit behind
    // /login, but there's no reason to let it get indexed either.
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#080c16",
  colorScheme: "dark",
  // Lets the layout reach under the notch and home bar; the mobile top bar
  // and bottom navigation pad themselves with env(safe-area-inset-*).
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${plex.variable} ${archivo.variable} font-sans antialiased`}>
        <Providers>
          {children}
          <Toaster theme="dark" position="top-right" richColors />
        </Providers>
      </body>
    </html>
  );
}
