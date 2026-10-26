import { ImageResponse } from "next/og";
import { BrandMark } from "@/lib/brand-mark";

export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Same mark as app/icon.tsx, scaled up for iOS home-screen/bookmark icons —
// solid background here since Apple touch icons render on an opaque tile,
// not the translucent browser-tab favicon.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "hsl(222, 47%, 6%)",
          borderRadius: 36,
        }}
      >
        <BrandMark size={112} />
      </div>
    ),
    { ...size }
  );
}
