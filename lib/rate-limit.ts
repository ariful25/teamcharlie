import type { NextRequest } from "next/server";

// Best-effort, in-memory, per server instance. On serverless hosting each
// instance keeps its own counts, so this slows down a single client hammering
// the public sign-up/invite endpoints but is NOT a real abuse barrier — put a
// shared store (e.g. Upstash/Vercel KV) or a WAF rule in front for that.
const buckets = new Map<string, { count: number; resetAt: number }>();

export function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.ip || "unknown";
}

/** true if this key is still under `limit` hits per `windowMs`. */
export function allowRequest(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 5000) {
      for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k);
    }
    return true;
  }
  bucket.count++;
  return bucket.count <= limit;
}
