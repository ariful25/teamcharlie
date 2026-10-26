import { ImageResponse } from "next/og";
import { BrandMark } from "@/lib/brand-mark";

export const runtime = "edge";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Matches the sidebar mark (lib/brand-mark.tsx): a
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
        <BrandMark size={20} strokeWidth={2.5} />
      </div>
    ),
    { ...size }
  );
}
