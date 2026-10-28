import { NextResponse } from "next/server";
import { getCurrentUserOrNull } from "@/lib/session";
import { isCompanyWide, permissions, type AppRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ListingHealthError } from "./service";

type Target = { propertyId?: string; reviewId?: string; stayId?: string; clientId?: string };

/** Signed-in user who may run checks / manage reviews, or an error response.
 *  With a target, a lead must also own it: their team's listing, review,
 *  guest stay or client. Admin and HR reach every team. */
export async function requireListingManager(target: Target = {}) {
  const user = await getCurrentUserOrNull();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!permissions.canManageKnowledgeBase(user.role)) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  if (!isCompanyWide(user.role) && !(await ownTeamOwns(user.teamId, user.squadId, target))) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  return { user };
}

/** The same check for ids that arrive in the request body. */
export async function reachesTarget(user: { role: AppRole; teamId: string; squadId: string | null }, target: Target) {
  return isCompanyWide(user.role) || ownTeamOwns(user.teamId, user.squadId, target);
}

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });
export { notFound as targetNotFound };

async function ownTeamOwns(teamId: string, squadId: string | null, t: Target) {
  const client = { teamId, squadId: squadId ?? "__none__" };
  const checks: Promise<unknown>[] = [];
  if (t.propertyId) checks.push(prisma.propertyKnowledgeItem.findFirst({ where: { id: t.propertyId, client }, select: { id: true } }));
  if (t.reviewId) checks.push(prisma.listingReview.findFirst({ where: { id: t.reviewId, property: { client } }, select: { id: true } }));
  if (t.clientId) checks.push(prisma.client.findFirst({ where: { id: t.clientId, ...client }, select: { id: true } }));
  // A stay not matched to a listing yet is shared triage for every team.
  if (t.stayId)
    checks.push(
      prisma.guestStay.findFirst({ where: { id: t.stayId, teamId, OR: [{ propertyId: null }, { property: { client } }] }, select: { id: true } })
    );
  return (await Promise.all(checks)).every(Boolean);
}

export function listingHealthErrorResponse(err: unknown, fallback: string) {
  if (err instanceof ListingHealthError) return NextResponse.json({ error: err.message }, { status: err.status });
  console.error(err);
  return NextResponse.json({ error: fallback }, { status: 500 });
}
