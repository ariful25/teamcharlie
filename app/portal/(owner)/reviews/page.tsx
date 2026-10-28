import Link from "next/link";
import { MessageSquareReply } from "lucide-react";
import { getPortalUser } from "@/lib/portal/session";
import { portalOverview } from "@/lib/portal/queries";
import { portalDate, stars } from "@/lib/portal/rules";
import { Stars } from "@/components/listing-health/shared";

export default async function PortalReviewsPage(props: { searchParams: Promise<{ stars?: string }> }) {
  const { stars: filter } = await props.searchParams;
  const owner = await getPortalUser();
  const { reviews } = await portalOverview(owner);
  const only = filter && /^[1-5]$/.test(filter) ? Number(filter) : null;
  const shown = only ? reviews.filter((r) => r.rating === only) : reviews;
  const count = (n: number) => reviews.filter((r) => r.rating === n).length;
  const avg = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null;
  const responded = reviews.filter((r) => r.respondedAt).length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Reviews</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {reviews.length} reviews across your listings · average {stars(avg)} · your team responded to {responded}
        </p>
      </div>

      <nav aria-label="Filter by stars" className="flex flex-wrap gap-2 text-sm">
        <Link href="/portal/reviews" className={`rounded-lg px-3 py-1.5 ${!only ? "bg-primary/15 text-primary" : "glass text-muted-foreground hover:text-foreground"}`}>
          All
        </Link>
        {[5, 4, 3, 2, 1].map((n) => (
          <Link key={n} href={`/portal/reviews?stars=${n}`} className={`rounded-lg px-3 py-1.5 tabular-nums ${only === n ? "bg-primary/15 text-primary" : "glass text-muted-foreground hover:text-foreground"}`}>
            {n}★ ({count(n)})
          </Link>
        ))}
      </nav>

      {shown.length === 0 ? (
        <p className="glass rounded-2xl p-5 text-sm text-muted-foreground">No reviews here.</p>
      ) : (
        <ul className="space-y-3">
          {shown.map((r) => (
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
              <p className="mt-2 text-sm">{r.comment || "No written review."}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
