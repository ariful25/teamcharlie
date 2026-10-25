// Pure review analysis — "what's wrong" from guest review texts. Rule-based
// (keyword themes + complaint cues per sentence) so it's free, instant and
// explainable: every theme comes with the actual sentences that triggered it.
// Covered by scripts/test-listing-health.ts.

export type ReviewInput = { id?: string; rating: number; comment: string; privateNote?: string | null; reviewDate?: Date | string | null };

export type Theme = { key: string; label: string; action: string; match: RegExp };

export const THEMES: Theme[] = [
  { key: "cleanliness", label: "Cleanliness", match: /\b(dirty|unclean|not clean|wasn'?t clean|dust(y)?|hair(s)?|stain(s|ed)?|filthy|grime|grimy|crumbs|mou?ld(y)?|sticky|trash|garbage|cleaning)\b/i, action: "Re-train the cleaner on the missed spots and add a photo checklist for each turnover." },
  { key: "smell", label: "Smell / odour", match: /\b(smell(s|ed|y)?|odou?r(s)?|musty|smok(e|y|ing)|stink(s|y)?)\b/i, action: "Find the source (HVAC filter, drains, carpets, smoking) and deodorise; add an air purifier if needed." },
  { key: "checkin", label: "Check-in / access", match: /\b(check[- ]?in|lock ?box|keypad|door code|code didn'?t|couldn'?t get in|access|key(s)?|instructions|find the (house|place|unit|entrance))\b/i, action: "Rewrite the arrival guide with photos of the entrance and test the lock/code before each arrival." },
  { key: "communication", label: "Communication", match: /\b(respon(se|sive|d)|repl(y|ied)|communicat\w*|message(s|d)?|reach (the )?host|no answer|ignored)\b/i, action: "Answer within the hour and follow up proactively on issues raised during the stay." },
  { key: "accuracy", label: "Not as described", match: /\b(not as (described|pictured|advertised)|misleading|pictures?|photos?|listing said|described as|advertised|smaller than)\b/i, action: "Update the photos and description so they match reality; call out limitations honestly." },
  { key: "maintenance", label: "Maintenance / broken items", match: /\b(broken|repair|leak(s|ing|y)?|not working|didn'?t work|doesn'?t work|malfunction\w*|toilet|plumbing|clogged|light ?bulb|door handle|furnace|heater|heating|\bac\b|a\/c|air conditioning|hot water|cold water)\b/i, action: "Log a maintenance task, fix it and check the item during every turnover." },
  { key: "wifi", label: "Wi-Fi / TV", match: /\b(wi-?fi|internet|connection|tv|television|streaming|netflix|remote)\b/i, action: "Test speed and logins; leave clear Wi-Fi/TV instructions; reboot or upgrade the router." },
  { key: "beds", label: "Beds / comfort", match: /\b(bed(s)?|mattress(es)?|pillow(s)?|sheets|linens?|blanket(s)?|uncomfortable|couch|sofa)\b/i, action: "Replace worn mattresses/pillows, add toppers and keep spare linens and blankets." },
  { key: "noise", label: "Noise", match: /\b(noise|noisy|loud|thin walls|neighbou?rs?|traffic|train|barking)\b/i, action: "Mention it in the description; add white-noise machines, earplugs and better window seals." },
  { key: "kitchen", label: "Kitchen / supplies", match: /\b(kitchen|cookware|pots?|pans?|utensils|dishes|knives|plates|stove|oven|fridge|microwave|coffee)\b/i, action: "Restock and upgrade kitchen basics; keep an inventory checklist for cleaners." },
  { key: "bathroom", label: "Bathroom", match: /\b(bath ?room|shower|towel(s)?|water pressure|tub|sink|drain)\b/i, action: "Check towels, water pressure and drains on every turnover." },
  { key: "supplies", label: "Missing supplies", match: /\b(ran out|no (soap|shampoo|toilet paper|paper towels|towels|coffee)|missing|toiletries|supplies)\b/i, action: "Use a fixed restock list and leave a little extra of everything consumable." },
  { key: "pests", label: "Pests", match: /\b(bug(s)?|bed ?bugs|roach(es)?|cockroach(es)?|ants|mice|mouse|rats?|spider(s)?|flies|insects?)\b/i, action: "Book pest control immediately and inspect before the next arrival." },
  { key: "parking", label: "Parking", match: /\b(parking|park(ed)?|garage|driveway|towed)\b/i, action: "Spell out exactly where to park (with a photo) in the listing and the arrival guide." },
  { key: "temperature", label: "Temperature", match: /\b(too (hot|cold|warm)|freezing|thermostat|chilly|stuffy)\b/i, action: "Check heating/AC capacity and leave thermostat instructions." },
  { key: "value", label: "Value / price", match: /\b(price(y|d)?|expensive|overpriced|value|fees?|cleaning fee|not worth|cost)\b/i, action: "Compare price and fees with nearby listings; add small extras that raise perceived value." },
  { key: "safety", label: "Safety / area", match: /\b(unsafe|safety|sketchy|scary|crime|break[- ]in|dangerous)\b/i, action: "Address the concern directly (lighting, locks, cameras disclosure) and set honest expectations." },
];

/** Words that turn a sentence into a complaint. */
const COMPLAINT_CUE =
  /\b(not|no|never|but|however|although|though|unfortunately|issue(s)?|problem(s)?|disappoint\w*|could (have )?be(en)? better|could use|needs?|wish|lacking|missing|broken|dirty|old|worn|uncomfortable|small|tiny|hard to|difficult|confusing|annoying|bad|poor|terrible|awful|horrible|worst|gross|smell\w*|noisy|loud)\b|n't\b/i;

/** Praise phrased with a negative ("no complaints", "nothing to fix"). */
const PRAISE_NEGATION =
  /\b(no|zero|not (a|any|one)|without any)\s+(complaints?|issues?|problems?|concerns?|hiccups?)\b|nothing (to complain|wrong|bad)|couldn'?t (ask|have asked) for|can'?t (say enough|recommend)|not disappoint|never (had|have) (a|any) (problem|issue)s?|didn'?t (have|want) to leave|no need/i;

/** Words that introduce the complaint half of a mixed sentence. */
const CONTRAST = /\b(?:but|however|although|though|except|unfortunately)\b/i;

/** Clearly positive sentences — not counted as complaints even in a 3★ review. */
const POSITIVE_CUE =
  /\b(great|amazing|perfect(ly)?|loved?|excellent|wonderful|comfortable|comfy|spotless|beautiful|fantastic|awesome|nice|very clean|super clean|easy|helpful|quick(ly)?|responsive|cozy|recommend)\b/i;

export function splitSentences(text: string) {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+|\n+|(?<=\S)\s+-\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

/** How much a complaint weighs, by the review's star rating. */
export const RATING_WEIGHT: Record<number, number> = { 1: 4, 2: 3, 3: 2, 4: 1, 5: 0.5 };

export type ThemeHit = { key: string; label: string; action: string; reviews: number; weight: number; quotes: { rating: number; text: string }[] };

/** Complaint themes found in one review (each theme once per review). */
export function complaintsIn(review: ReviewInput) {
  const text = [review.comment, review.privateNote].filter(Boolean).join(". ");
  const found = new Map<string, string>();
  for (const sentence of splitSentences(text)) {
    // "Great location and comfy beds, but the wifi kept dropping": only the
    // part after a contrast word is the complaint — split into clauses so the
    // praise before "but" isn't tagged.
    const clauses = sentence.split(CONTRAST);
    clauses.forEach((clause, i) => {
      const afterContrast = i > 0;
      // A clause is a complaint when it reads as one and isn't
      // praise-with-a-negative ("no complaints"). After "but" it counts unless
      // it's plainly positive; in a 1–3★ review a themed clause also counts
      // unless it's plainly positive.
      const complaint = COMPLAINT_CUE.test(clause) && !PRAISE_NEGATION.test(clause);
      const positive = POSITIVE_CUE.test(clause) && !COMPLAINT_CUE.test(clause);
      const isComplaint = complaint || ((afterContrast || review.rating <= 3) && !positive);
      if (!isComplaint) return;
      for (const theme of THEMES) {
        if (!found.has(theme.key) && theme.match.test(clause)) found.set(theme.key, sentence);
      }
    });
  }
  return found;
}

/** Ranked themes across a set of reviews, with example quotes (worst first). */
export function analyzeReviews(reviews: ReviewInput[]): ThemeHit[] {
  const hits = new Map<string, ThemeHit>();
  const sorted = [...reviews].sort((a, b) => a.rating - b.rating);
  for (const review of sorted) {
    for (const [key, sentence] of complaintsIn(review)) {
      const theme = THEMES.find((t) => t.key === key)!;
      const hit = hits.get(key) ?? { key, label: theme.label, action: theme.action, reviews: 0, weight: 0, quotes: [] };
      hit.reviews += 1;
      hit.weight += RATING_WEIGHT[review.rating] ?? 1;
      if (hit.quotes.length < 3) hit.quotes.push({ rating: review.rating, text: sentence.length > 220 ? `${sentence.slice(0, 217)}…` : sentence });
      hits.set(key, hit);
    }
  }
  return [...hits.values()].sort((a, b) => b.weight - a.weight || b.reviews - a.reviews);
}

export function starBuckets(reviews: { rating: number }[]) {
  const buckets = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 } as Record<1 | 2 | 3 | 4 | 5, number>;
  for (const r of reviews) if (r.rating >= 1 && r.rating <= 5) buckets[r.rating as 1 | 2 | 3 | 4 | 5]++;
  return buckets;
}

/** Theme keys for one review (shown as tags on the review card). */
export function themesOf(review: ReviewInput) {
  return [...complaintsIn(review).keys()].map((k) => THEMES.find((t) => t.key === k)!.label);
}
