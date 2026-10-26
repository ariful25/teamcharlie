// The review pipeline's rules. Pure — tested in scripts/test-reviews.ts.
//
// Airbnb gives guest and host 14 days after checkout to review; reviews stay
// hidden until both are in or the window closes. So the work is:
//   1. day of checkout  — "how was your stay?" follow-up
//   2. guest happy      — leave our review for them, then send the review request
//      guest had issues — fix it first (no review request until it's resolved)
//   3. guest reviewed   — respond publicly to anything under 5★
// Airbnb's Reviews Policy forbids incentives, pressure and reciprocal-review
// deals, so the request never offers anything and our review is written
// independently of theirs.

export const REVIEW_WINDOW_DAYS = 14;

export type Stage = "BOOKED" | "CHECKED_OUT" | "FOLLOW_UP_SENT" | "ISSUE" | "ASK_REVIEW" | "REVIEW_REQUESTED" | "REVIEWED" | "EXPIRED" | "CANCELLED";

export const STAGES: { key: Stage; label: string; hint: string }[] = [
  { key: "BOOKED", label: "Booked", hint: "Upcoming or in stay" },
  { key: "CHECKED_OUT", label: "Follow up", hint: "Checked out. Ask how the stay was." },
  { key: "FOLLOW_UP_SENT", label: "Waiting for reply", hint: "Follow-up sent" },
  { key: "ISSUE", label: "Fix an issue", hint: "Guest wasn't fully happy" },
  { key: "ASK_REVIEW", label: "Ask for review", hint: "Guest happy. Review them, then send the request." },
  { key: "REVIEW_REQUESTED", label: "Waiting for review", hint: "Review request sent" },
  { key: "REVIEWED", label: "Reviewed", hint: "Guest left a review" },
  { key: "EXPIRED", label: "No review", hint: "14-day window closed" },
  { key: "CANCELLED", label: "Cancelled", hint: "Reservation cancelled" },
];

export const OPEN_STAGES: Stage[] = ["CHECKED_OUT", "FOLLOW_UP_SENT", "ISSUE", "ASK_REVIEW", "REVIEW_REQUESTED"];

type StayLike = { stage: string; checkOut: Date | null; rating?: number | null };

export function reviewWindowEnds(checkOut: Date | null) {
  return checkOut ? new Date(checkOut.getTime() + REVIEW_WINDOW_DAYS * 86_400_000) : null;
}

/** Whole days left to review (0 on the last day), or null with no checkout. */
export function daysLeft(checkOut: Date | null, today: Date) {
  const end = reviewWindowEnds(checkOut);
  return end ? Math.round((end.getTime() - today.getTime()) / 86_400_000) : null;
}

/**
 * The stage a stay moves to on its own as days pass (no email needed):
 * checkout day reached → CHECKED_OUT; window over without a review → EXPIRED.
 * `today` is the team's calendar day (UTC midnight).
 */
export function timedStage(stay: StayLike, today: Date): Stage | null {
  if (!stay.checkOut || stay.stage === "CANCELLED" || stay.stage === "REVIEWED" || stay.stage === "EXPIRED") return null;
  if (stay.stage === "BOOKED" && stay.checkOut.getTime() <= today.getTime()) {
    // A stay we only learn about after its window closed goes straight to EXPIRED.
    return today.getTime() >= reviewWindowEnds(stay.checkOut)!.getTime() ? "EXPIRED" : "CHECKED_OUT";
  }
  if (OPEN_STAGES.includes(stay.stage as Stage) && today.getTime() >= reviewWindowEnds(stay.checkOut)!.getTime()) return "EXPIRED";
  return null;
}

export type StayAction = "FOLLOW_UP_SENT" | "HAPPY" | "ISSUE" | "ISSUE_RESOLVED" | "REVIEW_REQUESTED" | "HOST_REVIEWED" | "CLOSE";

/** Which stage an action moves a stay to, or null when it isn't allowed from here. */
export function stageAfter(stage: Stage, action: StayAction): Stage | null {
  switch (action) {
    case "FOLLOW_UP_SENT":
      return stage === "CHECKED_OUT" ? "FOLLOW_UP_SENT" : null;
    case "HAPPY":
      return ["CHECKED_OUT", "FOLLOW_UP_SENT", "ISSUE"].includes(stage) ? "ASK_REVIEW" : null;
    case "ISSUE":
      return ["CHECKED_OUT", "FOLLOW_UP_SENT"].includes(stage) ? "ISSUE" : null;
    case "ISSUE_RESOLVED":
      // Fixed and the guest is OK now → ready to ask.
      return stage === "ISSUE" ? "ASK_REVIEW" : null;
    case "REVIEW_REQUESTED":
      return ["CHECKED_OUT", "FOLLOW_UP_SENT", "ASK_REVIEW", "REVIEW_REQUESTED"].includes(stage) ? "REVIEW_REQUESTED" : null;
    case "HOST_REVIEWED":
      return stage; // logged only; doesn't move the stay
    case "CLOSE":
      return stage === "CANCELLED" || stage === "REVIEWED" ? null : "EXPIRED";
  }
}

/** Task the team should do for a stay in this stage (one open task per stay). */
export function taskFor(stage: Stage, rating: number | null | undefined, hostReviewed = false): { key: string; title: string; priority: "NORMAL" | "IMPORTANT" | "URGENT" } | null {
  // The guest reviewed but Airbnb hides it until we review them.
  if (stage === "REVIEWED" && (rating === null || rating === undefined)) {
    return hostReviewed ? null : { key: "review-guest", title: "Guest reviewed us. Review them to see it", priority: "IMPORTANT" };
  }
  switch (stage) {
    case "CHECKED_OUT":
      return { key: "follow-up", title: "Follow up: ask how the stay was", priority: "IMPORTANT" };
    case "ISSUE":
      return { key: "issue", title: "Resolve the guest's issue", priority: "URGENT" };
    case "ASK_REVIEW":
      return { key: "ask", title: "Review the guest, then send the review request", priority: "IMPORTANT" };
    case "REVIEW_REQUESTED":
      return null; // waiting on the guest
    case "REVIEWED":
      return rating !== null && rating !== undefined && rating < 5 ? { key: "respond", title: `Respond to a ${rating}★ review`, priority: rating <= 3 ? "URGENT" : "IMPORTANT" } : null;
    default:
      return null;
  }
}

/** First name for messages: "Sarah Jones" → "Sarah". */
export function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

/** Same person? Airbnb shows first names in some emails and full names in others. */
export function sameGuest(a: string, b: string) {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  return x === y || firstName(x) === firstName(y);
}
