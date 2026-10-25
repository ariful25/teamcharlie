// Guest message templates for the review pipeline. Teams can edit them
// (MessageTemplate); these are the defaults. Placeholders: {firstName},
// {listing}, {host}. Written to stay inside Airbnb's Reviews Policy: no
// incentives, no pressure, and no "I'll review you if you review us" deal —
// our review of the guest is left independently, before we ask.

export type TemplateKey = "FOLLOW_UP" | "REVIEW_REQUEST" | "ISSUE_RECOVERY" | "THANK_YOU";

export const TEMPLATE_META: Record<TemplateKey, { label: string; when: string }> = {
  FOLLOW_UP: { label: "Checkout follow-up", when: "Day of checkout, before asking for anything" },
  REVIEW_REQUEST: { label: "Review request", when: "After the guest says the stay went well (and after we've reviewed them)" },
  ISSUE_RECOVERY: { label: "Issue follow-up", when: "When the guest mentions a problem" },
  THANK_YOU: { label: "Thank you for the review", when: "After a 5★ review" },
};

export const DEFAULT_TEMPLATES: Record<TemplateKey, string> = {
  FOLLOW_UP: `Hi {firstName}! Thank you for staying with us. We hope you had a safe trip home. I also wanted to follow up and ask if you enjoyed your stay. Did everything go well?`,
  REVIEW_REQUEST: `Hi {firstName}! 😊 Thank you again for staying with us. You were a wonderful guest, and we've already left you a review. 🌟

If you enjoyed your stay, we'd be so grateful if you left us a review too. A quick note, since many guests don't know: on Airbnb, anything below 5 stars lowers a listing's overall score and how often it's shown. So if everything met your expectations, a 5-star Overall rating truly makes a huge difference for our family business. And if anything wasn't perfect, please tell us. We'd love the chance to fix it.

If you loved the place, tapping the ❤️ at the top of the listing to save it to your favorites helps us tremendously too!

Thank you so much for choosing to stay with us. We hope to host you again! 😊❤️`,
  ISSUE_RECOVERY: `Hi {firstName}, thank you for telling us. I'm really sorry about that. We're looking into it right away so the next guests don't run into the same thing. Is there anything else we could have done better during your stay?`,
  THANK_YOU: `Thank you so much for the wonderful review, {firstName}! It was a pleasure hosting you and we hope to welcome you back soon. 😊`,
};

export function fillTemplate(body: string, vars: { firstName: string; listing: string; host?: string }) {
  return body
    .replace(/\{firstName\}/g, vars.firstName)
    .replace(/\{listing\}/g, vars.listing)
    .replace(/\{host\}/g, vars.host ?? "");
}

/** Phrases that can read as a review deal or incentive under Airbnb's Reviews Policy. */
export function policyWarnings(body: string): string[] {
  const out: string[] = [];
  if (/(discount|refund|coupon|voucher|gift|free night|credit|\$\d|reimburse)/i.test(body)) out.push("Mentions something of value. Airbnb forbids incentives for reviews.");
  if (/(if you|in exchange|in return)[^.]{0,60}(5|five)[- ]?star[^.]{0,40}(I|we)('ll| will)/i.test(body) || /(I|we)(['’]ll| will) (be )?leav(e|ing) you a 5[- ]?star[\s\S]{0,300}?(as well|too|in return)/i.test(body))
    out.push("Reads like a review exchange (our 5★ for theirs). Airbnb forbids reciprocal-review deals.");
  if (/(must|have to|need you to) (leave|give)/i.test(body)) out.push("Sounds like pressure. Airbnb forbids pressuring guests about reviews.");
  return out;
}
