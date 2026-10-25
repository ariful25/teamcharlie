"use client";

import { useEffect } from "react";

// Last-resort boundary for errors in the root layout itself. It replaces the
// whole document, so it can't use the app's components or fonts.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) import("@sentry/nextjs").then((Sentry) => Sentry.captureException(error));
  }, [error]);
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "hsl(222 47% 6%)", color: "hsl(210 40% 96%)", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ textAlign: "center", maxWidth: 360, padding: 24 }}>
          <p style={{ fontSize: 16, fontWeight: 600 }}>TeamHQ couldn&apos;t load</p>
          <p style={{ fontSize: 13, opacity: 0.7 }}>Something went wrong on our side. Your data is safe.</p>
          <button onClick={() => reset()} style={{ marginTop: 13, padding: "8px 21px", borderRadius: 13, border: 0, background: "hsl(189 94% 55%)", color: "hsl(222 47% 6%)", fontWeight: 600, cursor: "pointer" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
