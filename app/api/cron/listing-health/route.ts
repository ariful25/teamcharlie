import { NextRequest, NextResponse } from "next/server";
import { runWeeklyChecks } from "@/lib/listing-health/weekly";

// Daily Vercel cron (vercel.json) that keeps Listing Health ~weekly-fresh and
// sends rating-drop alerts. Same CRON_SECRET guard as the daily digest.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await runWeeklyChecks();
  return NextResponse.json(result);
}
