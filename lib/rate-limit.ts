import { prisma } from "@/lib/prisma";

// Rate limiting backed by Postgres (RateLimit table), so every serverless
// instance shares the same counts. Fixed windows: a key's count resets when
// its window ends. Used for sign-in, sign-up and invite acceptance.

/** Best-effort client IP behind Vercel's proxy. */
export function clientIp(headers: Headers | Record<string, string | string[] | undefined>) {
  const get = (name: string) => {
    if (headers instanceof Headers) return headers.get(name);
    const v = headers[name];
    return Array.isArray(v) ? v[0] : v ?? null;
  };
  return get("x-forwarded-for")?.split(",")[0]?.trim() || get("x-real-ip") || "unknown";
}

/** Counts one hit and returns the count inside the current window. */
export async function hit(key: string, windowMs: number): Promise<number> {
  // Times are the app's UTC clock, sent as text cast to the column's
  // timezone-less type. Neither now() nor a JS Date parameter (sent as
  // timestamptz) is safe here: both shift with the database session's timezone.
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const ends = new Date(nowDate.getTime() + windowMs).toISOString();
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimit" ("key", "count", "windowEnds")
    VALUES (${key}, 1, CAST(${ends} AS timestamp))
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."windowEnds" < CAST(${now} AS timestamp) THEN 1 ELSE "RateLimit"."count" + 1 END,
      "windowEnds" = CASE WHEN "RateLimit"."windowEnds" < CAST(${now} AS timestamp) THEN CAST(${ends} AS timestamp) ELSE "RateLimit"."windowEnds" END
    RETURNING "count"`;
  return Number(rows[0]?.count ?? 1);
}

/** Current count for a key (0 once its window has ended). */
export async function peek(key: string): Promise<number> {
  const row = await prisma.rateLimit.findUnique({ where: { key } });
  return row && row.windowEnds.getTime() > Date.now() ? row.count : 0;
}

export async function clear(key: string) {
  await prisma.rateLimit.deleteMany({ where: { key } });
}

/** true while `key` is still under `limit` hits per `windowMs` (counts this request). */
export async function allowRequest(key: string, limit: number, windowMs: number) {
  return (await hit(key, windowMs)) <= limit;
}

// Sign-in: 10 failures per account or 30 per IP in 15 minutes locks it out
// for the rest of the window. A successful sign-in clears the account count.
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_MAX_PER_ACCOUNT = 10;
export const LOGIN_MAX_PER_IP = 30;
