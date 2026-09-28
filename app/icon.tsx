import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Matches the sidebar mark exactly (components/layout/sidebar.tsx): a
// rounded cyan-tinted square with the lucide "radar" icon — the app has no
// separate logo asset, this *is* the logo, so the favicon is generated from
// the same brand tokens (app/globals.css) instead of a hand-made image.
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "hsla(189, 94%, 55%, 0.18)",
          borderRadius: 7,
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="hsl(189, 94%, 55%)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
    ),
    { ...size }
  );
}
