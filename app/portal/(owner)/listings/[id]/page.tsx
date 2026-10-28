import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Award, ExternalLink, KeyRound, MessageSquareReply } from "lucide-react";
import { getPortalUser } from "@/lib/portal/session";
import { portalListing } from "@/lib/portal/queries";
import { healthWord, portalDate } from "@/lib/portal/rules";
import { Badge } from "@/components/ui/badge";
import { Bar, Rating, ScoreBadge, Stars } from "@/components/listing-health/shared";
import { SEVERITY_TONE, categoryBarTone } from "@/lib/listing-health/tones";
import { RequestForm } from "@/components/portal/request-form";

const CATEGORIES = [
  ["cleanliness", "Cleanliness"],
  ["accuracy", "Accuracy"],
  ["checkin", "Check-in"],
  ["communication", "Communication"],
  ["location", "Location"],
  ["value", "Value"],
] as const;

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-line text-sm">{value || "·"}</dd>
    </div>
  );
}

export default async function PortalListingPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const owner = await getPortalUser();
  const l = await portalListing(owner, id);
  if (!l) notFound();
  const h = l.health;

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Link href="/portal" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
          <ArrowLeft className="h-3 w-3" /> Overview
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">{l.listingName ?? l.internalName}</h1>
            <p className="text-sm text-muted-foreground">{l.location ?? l.propertyType ?? ""}</p>
          </div>
          <a href={l.airbnbUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
            View on Airbnb <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-golden">
        <section className="glass space-y-5 rounded-2xl p-5">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-display text-lg font-semibold">Listing health</h2>
            <ScoreBadge score={h?.healthScore ?? null} />
            <span className="text-sm text-muted-foreground">{healthWord(h?.healthScore)}</span>
            {h?.guestFavorite && (
              <Badge tone="primary">
                <Award className="mr-1 h-3 w-3" /> Guest favorite
              </Badge>
            )}
          </div>
          {h ? (
            <>
              <div className="flex flex-wrap gap-5 text-sm">
                <span className="inline-flex items-center gap-2">
                  <Rating value={h.rating} /> <span className="text-muted-foreground">{h.reviewCount ?? 0} reviews on Airbnb</span>
                </span>
                <span className="text-muted-foreground">{h.photoCount ?? "·"} photos</span>
                <span className="text-muted-foreground">Checked {portalDate(h.fetchedAt)}</span>
              </div>
              <div className="space-y-2">
                {CATEGORIES.map(([key, label]) => {
                  const v = h[key];
                  return <Bar key={key} label={label} value={v == null ? 0 : ((v - 4) / 1) * 100} display={v == null ? "·" : v.toFixed(1)} tone={categoryBarTone(v)} />;
                })}
              </div>
              {h.issues.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium">What could be better</h3>
                  <ul className="space-y-2">
                    {h.issues.map((i) => (
                      <li key={i.title} className="flex items-start gap-3 text-sm">
                        <Badge tone={SEVERITY_TONE[i.severity]}>{{ high: "High", medium: "Medium", low: "Low" }[i.severity]}</Badge>
                        <span>{i.title}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground">Your team sees the same list and works through it.</p>
                </div>
              )}
              {l.history.length > 1 && (
                <div>
                  <h3 className="mb-2 text-sm font-medium">Score over time</h3>
                  <ol className="flex items-end gap-1" aria-label="Health score history">
                    {l.history.map((p) => (
                      <li
                        key={p.fetchedAt.toISOString()}
                        title={`${portalDate(p.fetchedAt)}: ${p.healthScore ?? "·"}`}
                        className="w-full rounded-t bg-primary/60"
                        style={{ height: `${Math.max(4, (p.healthScore ?? 0) * 0.8)}px` }}
                      />
                    ))}
                  </ol>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Your team hasn&apos;t run a health check on this listing yet.</p>
          )}
        </section>

        <section className="glass space-y-5 rounded-2xl p-5">
          <h2 className="font-display text-lg font-semibold">Ask your team</h2>
          <RequestForm listings={[]} propertyId={l.id} />
        </section>
      </div>

      <section className="glass space-y-5 rounded-2xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">Property details</h2>
          <p className="text-xs text-muted-foreground">What your team and guests work from. Updated {portalDate(l.updatedAt)}.</p>
        </div>
        <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Detail label="Type" value={l.propertyType} />
          <Detail label="Guests" value={l.guestCapacity} />
          <Detail label="Bedrooms, beds, baths" value={[l.bedrooms, l.beds, l.bathrooms].map((n) => n ?? "·").join(", ")} />
          <Detail label="Check-in" value={l.checkInInfo} />
          <Detail label="Checkout" value={l.checkoutInfo} />
          <Detail label="Parking" value={l.parkingInfo} />
          <Detail label="House rules" value={l.rules} />
          <Detail label="Wi-Fi" value={l.wifiName ? `${l.wifiName}${l.hasWifiPassword ? ", password on file" : ""}` : null} />
          <Detail
            label="Door code"
            value={
              <span className="inline-flex items-center gap-1">
                <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                {l.hasDoorCode ? "On file, not shown here" : "None on file"}
              </span>
            }
          />
        </dl>
        {l.amenities.length > 0 && <Detail label={`Amenities (${l.amenities.length})`} value={l.amenities.join(", ")} />}
        {l.description && <Detail label="Description" value={l.description} />}
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold">Reviews for this listing</h2>
        {l.reviews.length === 0 ? (
          <p className="glass rounded-2xl p-5 text-sm text-muted-foreground">No reviews yet.</p>
        ) : (
          <ul className="space-y-3">
            {l.reviews.map((r) => (
              <li key={r.id} className="glass rounded-2xl p-5">
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <Stars count={r.rating} />
                  <span className="font-medium text-foreground">{r.guestName ?? "A guest"}</span>
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
      </section>
    </div>
  );
}
