import { ImageResponse } from "next/og";
import { BRAND_BACKGROUND, BrandMark } from "@/lib/brand-mark";

export const runtime = "edge";

// Home-screen icons for the installable app (app/manifest.ts). "maskable"
// keeps the mark inside the middle 60% so Android's circle/squircle crop
// never cuts it; the plain one fills a rounded tile.
const SIZES = new Set([192, 512]);

export async function GET(req: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size);
  if (!SIZES.has(size)) return new Response("Not found", { status: 404 });
  const maskable = new URL(req.url).searchParams.get("maskable") === "1";
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: BRAND_BACKGROUND,
          borderRadius: maskable ? 0 : size * 0.2,
        }}
      >
        <BrandMark size={Math.round(size * (maskable ? 0.5 : 0.62))} />
      </div>
    ),
    { width: size, height: size, headers: { "Cache-Control": "public, max-age=86400" } }
  );
}
