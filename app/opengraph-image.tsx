import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Charlie HQ — STR Assistance Operations Platform";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Reuses the same mark and dark/cyan brand tokens as the favicon and the
// app itself (app/globals.css) — a link preview should look like it came
// from the product, not a generic placeholder card.
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          // A plain solid fill, not the app's radial-gradient body background
          // — satori (the renderer behind ImageResponse) doesn't parse that
          // gradient syntax, and a static OG card doesn't need the glow.
          background: "hsl(222, 47%, 6%)",
        }}
      >
        <div
          style={{
            display: "flex",
            width: 120,
            height: 120,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 28,
            background: "hsla(189, 94%, 55%, 0.15)",
            boxShadow: "0 0 0 2px hsla(189, 94%, 55%, 0.35)",
            marginBottom: 40,
          }}
        >
          <svg width="68" height="68" viewBox="0 0 24 24" fill="none" stroke="hsl(189, 94%, 55%)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19.07 4.93A10 10 0 0 0 6.99 3.34" />
            <path d="M4 6h.01" />
            <path d="M2.29 9.62A10 10 0 1 0 21.31 8.35" />
            <path d="M16.24 7.76A6 6 0 1 0 8.23 16.67" />
            <path d="M12 18h.01" />
            <path d="M17.99 11.66A6 6 0 0 1 15.77 16.67" />
            <circle cx="12" cy="12" r="2" />
            <path d="m13.41 10.59 5.66-5.66" />
          </svg>
        </div>
        <div style={{ display: "flex", fontSize: 76, fontWeight: 700, color: "hsl(210, 40%, 96%)", letterSpacing: -1.5 }}>
          Charlie HQ
        </div>
        <div style={{ display: "flex", marginTop: 18, fontSize: 30, color: "hsl(215, 20%, 65%)" }}>
          STR Assistance — Operations Platform
        </div>
      </div>
    ),
    { ...size }
  );
}
