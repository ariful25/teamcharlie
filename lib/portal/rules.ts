// Pure rules for the client portal: unit-tested in scripts/test-portal.ts.

export type RequestKind = "KNOWLEDGE_BASE" | "LISTING" | "REVIEW" | "OTHER";

export const REQUEST_KIND_LABEL: Record<RequestKind, string> = {
  KNOWLEDGE_BASE: "Property details",
  LISTING: "Listing change",
  REVIEW: "A review",
  OTHER: "Something else",
};

/** The task an owner's request becomes on their team's board. */
export function requestTask(kind: RequestKind, clientName: string, listingName: string | null, message: string) {
  const what = { KNOWLEDGE_BASE: "update property details", LISTING: "change the listing", REVIEW: "look at a review", OTHER: "help" }[kind];
  return {
    title: `${clientName} asked to ${what}${listingName ? `: ${listingName}` : ""}`.slice(0, 140),
    description: message,
    // A client waiting on us is never "low".
    priority: kind === "REVIEW" ? ("IMPORTANT" as const) : ("NORMAL" as const),
  };
}

export const requestSourceRef = (requestId: string) => `creq:${requestId}`;

export function requestIdFromSourceRef(sourceRef: string | null | undefined) {
  return sourceRef?.match(/^creq:([A-Za-z0-9_-]+)$/)?.[1] ?? null;
}

/** "92" with a word owners understand, not just a number. */
export function healthWord(score: number | null | undefined) {
  // Same bands as the staff Listing Health colours (components/listing-health/shared.tsx).
  if (score == null) return "Not checked yet";
  if (score >= 90) return "Excellent";
  if (score >= 80) return "Good";
  if (score >= 60) return "Needs attention";
  return "At risk";
}

/** Average stars to one decimal, "·" when there's nothing to average. */
export function stars(n: number | null | undefined) {
  return n == null ? "·" : n.toFixed(n >= 4.995 ? 0 : 2).replace(/0$/, "");
}

/** The WhatsApp message an owner gets with their portal link. */
export function portalInviteMessage(name: string, clientName: string, link: string) {
  const first = name.split(/\s+/)[0] || name;
  return `Hi ${first}, here is your owner portal for ${clientName}: listing health, reviews and your property details in one place. Set your password here: ${link} (the link works once and expires in 7 days).`;
}

/** "26 Oct 2026": review and request dates are calendar days. */
export function portalDate(d: Date | string | null | undefined) {
  if (!d) return "·";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

const SECRET_WORD = String.raw`(?:door\s*code|code|pass(?:word|code)?|pin|combo|combination|lock\s*box|key\s*(?:box|pad)|gate|wi-?fi|network\s*key)`;

/**
 * Free text an owner sees (check-in steps, parking, rules) with codes hidden.
 * Codes get typed into these fields ("lockbox on the side door, code 4821"),
 * so hiding the door code field alone isn't enough. Hides: any run of 4+
 * digits (also "48 21" or "555-0199"); a word with a digit after a code
 * word ("code A12B", "code is 7731"); anything after "password:" or "code =".
 */
export function hideCodes(text: string | null | undefined) {
  if (!text) return text ?? null;
  return text
    .replace(new RegExp(String.raw`\b(${SECRET_WORD})(\s*[:=]\s*)([^\s,;]+)`, "gi"), "$1$2[hidden]")
    .replace(new RegExp(String.raw`\b(${SECRET_WORD})(\s*(?:is\s+)?#?\s*)([A-Za-z]*\d[\w#-]*(?:\s+\d[\w#-]*)*)`, "gi"), "$1$2[hidden]")
    .replace(/(?<![\w[])\d[\d\s-]{2,}\d(?![\w\]])/g, (m) => (m.replace(/\D/g, "").length >= 4 ? "[hidden]" : m));
}
