import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { GeistSans } from "geist/font/sans";
import "./globals.css";
import { Toaster } from "sonner";
import { Providers } from "./providers";
import { Analytics } from "@vercel/analytics/next";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Charlie HQ — Team Charlie Operations Center",
  description: "Internal operations management platform for Team Charlie, STR Assistance.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${GeistSans.variable} font-sans antialiased`}>
        <Providers>
          {children}
          <Toaster theme="dark" position="top-right" richColors />
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}
