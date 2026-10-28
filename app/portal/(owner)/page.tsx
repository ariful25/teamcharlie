import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Award, ChevronRight, MessageSquareReply } from "lucide-react";
import { getPortalUser } from "@/lib/portal/session";
import { portalOverview } from "@/lib/portal/queries";
import { healthWord, portalDate, stars } from "@/lib/portal/rules";
import { Badge } from "@/components/ui/badge";
import { Rating, ScoreBadge, Stars } from "@/components/listing-health/shared";
import { scoreTone } from "@/lib/listing-health/tones";
import { cn } from "@/lib/utils";

const pct = (n: number | null) => (n == null ? "·" : `${Math.round(n * 100)}%`);
const WORD_TONE: Record<string, string> = { success: "text-success", warning: "text-warning", danger: "text-danger", neutral: "text-muted-foreground" };

export default async function PortalOverviewPage() {
  const owner = await getPortalUser();
  const { listings, reviews, requests, kpis } = await portalOverview(owner);
  const open = requests.filter((r) => r.status === "OPEN").length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">Hi {owner.name.split(" ")[0]}</h1>
        <p className="mt-1 text-sm text-muted-foreground">How your listings are doing, from your team&apos;s latest checks and your guests&apos; reviews.</p>
      </div>

      <section aria-label="Last 90 days" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Average rating", stars(kpis.average90), "last 90 days"],
          ["Reviews", String(kpis.reviews90), "last 90 days"],
          ["Five-star share", pct(kpis.fiveStar90), "of those reviews"],
          ["Requests open", String(open), open ? "your team is on it" : "nothing waiting"],
        ].map(([label, value, hint]) => (
          <div key={label} className="glass rounded-2xl px-5 py-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="font-display text-2xl font-semibold tabular-nums">{value}</p>
            <p className="text-[11px] text-muted-foreground">{hint}</p>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Your listings</h2>
        {listings.length === 0 ? (
          <p className="glass rounded-2xl p-5 text-sm text-muted-foreground">Your team hasn&apos;t added your listings yet.</p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {listings.map((l) => (
              <li key={l.id} className="min-w-0">
                <Link href={`/portal/listings/${l.id}`} className="glass glow-border group flex h-full flex-col gap-3 rounded-2xl p-5 transition hover:brightness-110">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{l.listingName ?? l.internalName}</p>
                      {(l.location ?? l.propertyType) && <p className="truncate text-xs text-muted-foreground">{l.location ?? l.propertyType}</p>}
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <ScoreBadge score={l.health?.healthScore ?? null} label="Health" />
                    <span className={cn("text-xs", WORD_TONE[scoreTone(l.health?.healthScore ?? null)])}>
                      {healthWord(l.health?.healthScore)}
                    </span>
                    {l.health?.trend != null && l.health.trend !== 0 && (
                      <span className={cn("inline-flex items-center text-xs tabular-nums", l.health.trend > 0 ? "text-success" : "text-danger")}>
                        {l.health.trend > 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                        {Math.abs(l.health.trend)}
                      </span>
                    )}
                  </div>
                  <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
                    <Rating value={l.health?.rating ?? null} />
                    <span>{l.health?.reviewCount != null ? `${l.health.reviewCount} reviews on Airbnb` : "Not checked yet"}</span>
                    {l.health?.guestFavorite && (
                      <Badge tone="primary">
                        <Award className="mr-1 h-3 w-3" /> Guest favorite
                      </Badge>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Latest reviews</h2>
          <Link href="/portal/reviews" className="text-xs text-primary hover:underline">
            All reviews
          </Link>
        </div>
        {reviews.length === 0 ? (
          <p className="glass rounded-2xl p-5 text-sm text-muted-foreground">No reviews yet.</p>
        ) : (
          <ul className="space-y-3">
            {reviews.slice(0, 5).map((r) => (
              <li key={r.id} className="glass rounded-2xl p-5">
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <Stars count={r.rating} />
                  <span className="font-medium text-foreground">{r.guestName ?? "A guest"}</span>
                  <span>{r.property.listingName ?? r.property.internalName}</span>
                  <span>{portalDate(r.reviewDate)}</span>
                  {r.respondedAt && (
                    <span className="inline-flex items-center gap-1 text-success">
                      <MessageSquareReply className="h-3.5 w-3.5" /> Responded
                    </span>
                  )}
                </div>
                <p className="mt-2 line-clamp-3 text-sm">{r.comment || "No written review."}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
