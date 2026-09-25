// A deliberate exception to the app's cyan/glass palette (see the NoticeColor
// comment in prisma/schema.prisma) — these six colors are what make a notice
// read as a physical sticky note instead of another dark glass card. `card`
// pairs a light background with dark text so the note stays legible against
// the app's dark background, the way real paper does against a dark corkboard.
export const NOTICE_COLOR_STYLES: Record<string, { card: string; swatch: string }> = {
  YELLOW: { card: "bg-amber-200 text-amber-950", swatch: "bg-amber-300" },
  PINK: { card: "bg-pink-200 text-pink-950", swatch: "bg-pink-300" },
  BLUE: { card: "bg-sky-200 text-sky-950", swatch: "bg-sky-300" },
  PURPLE: { card: "bg-violet-200 text-violet-950", swatch: "bg-violet-300" },
  GREEN: { card: "bg-emerald-200 text-emerald-950", swatch: "bg-emerald-300" },
  ORANGE: { card: "bg-orange-200 text-orange-950", swatch: "bg-orange-300" },
};
