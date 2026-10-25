"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, ExternalLink, ClipboardPaste, Plus, RefreshCw, Trash2, Upload, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/tooltip";
import { useTeamTimezone } from "@/components/providers/team-timezone";
import { formatClientDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { SnapshotView } from "@/lib/listing-health/queries";
import { Bar, Rating, SEVERITY_TONE, Stars, categoryBarTone, scoreTone } from "./shared";
import { AddReviewDialog, ImportReviewsDialog } from "./review-dialogs";
import { PasteReviewsDialog } from "./paste-reviews";
import { FixTaskButton } from "./fix-task-button";
import { AiAssistant, CheckinGuideCard, ReviewReply } from "./ai-panel";

type Review = {
  id: string;
  rating: number;
  comment: string;
  privateNote: string | null;
  guestName: string | null;
  reviewDate: string | null;
  source: string;
  themes: string[];
};

type Theme = { key: string; label: string; reviews: number; action: string; quotes: { rating: number; text: string }[] };

const CATEGORY_LABEL: Record<string, string> = {
  cleanliness: "Cleanliness",
  accuracy: "Accuracy",
  checkin: "Check-in",
  communication: "Communication",
  location: "Location",
  value: "Value",
};

export function ListingDetail({
  property,
  latest,
  missing,
  history,
  reviews,
  themes,
  byStar,
  canManage,
  secrets,
  templateGuide,
  ai,
  linkedTasks,
  people,
}: {
  property: { id: string; internalName: string; listingName: string | null; airbnbUrl: string; clientId: string; clientName: string };
  latest: SnapshotView | null;
  missing: { key: string[]; safety: string[] } | null;
  history: { fetchedAt: string; rating: number | null; reviewCount: number | null; healthScore: number | null }[];
  reviews: Review[];
  themes: Theme[];
  byStar: Record<1 | 2 | 3 | 4 | 5, number>;
  canManage: boolean;
  secrets: { doorCode: string | null; wifiName: string | null; wifiPassword: string | null };
  templateGuide: string;
  ai: {
    ready: boolean;
    insights: { content: any; model: string; createdAt: string } | null;
    guide: { content: any; model: string; createdAt: string } | null;
    copy: { content: any; model: string; createdAt: string } | null;
    replies: Record<string, { text: string; createdAt: string }>;
  };
  linkedTasks: Record<string, { id: string; status: string }>;
  people: { id: string; name: string }[];
}) {
  const tz = useTeamTimezone();
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [starFilter, setStarFilter] = useState<number | "low" | "all">("low");
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);

  async function recheck() {
    setChecking(true);
    const res = await fetch(`/api/listing-health/${property.id}/refresh?force=true`, { method: "POST" });
    setChecking(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) toast.error(data.error ?? "Check failed");
    else if (data.ok === false) toast.error(data.error ?? "Airbnb didn't return the listing");
    else toast.success("Health check updated");
    router.refresh();
  }

  async function removeReview(id: string) {
    if (!confirm("Delete this review from Team HQ? (It stays on Airbnb.)")) return;
    const res = await fetch(`/api/listing-health/reviews/${id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Review deleted");
      router.refresh();
    } else toast.error("Could not delete the review");
  }

  const shown = reviews.filter((r) => (starFilter === "all" ? true : starFilter === "low" ? r.rating <= 4 : r.rating === starFilter));
  const s = latest;

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div className="min-w-0">
          <Link href={`/listing-health?clientId=${property.clientId}`} className="mb-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3 w-3" /> {property.clientName} listings
          </Link>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{property.internalName}</h1>
          <a href={property.airbnbUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
            {property.listingName ?? "Open on Airbnb"} <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setPasteOpen(true)}>
              <ClipboardPaste className="h-4 w-4" /> Paste reviews
            </Button>
            <Button variant="secondary" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" /> Import CSV
            </Button>
            <Button variant="secondary" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" /> Add review
            </Button>
            <Button onClick={recheck} disabled={checking}>
              <RefreshCw className={cn("h-4 w-4", checking && "animate-spin")} /> {checking ? "Checking…" : "Check now"}
            </Button>
          </div>
        )}
      </div>

      {!s ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            This listing hasn&apos;t been checked yet.{canManage ? " Press “Check now” to read its ratings and listing details from Airbnb." : ""}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Tile label="Rating" value={s.ok ? <Rating value={s.rating} className="text-2xl" /> : "·"} hint={s.ok ? `${s.reviewCount ?? 0} reviews` : undefined} />
            <Tile label="Health" value={<ScoreValue score={s.healthScore} />} hint="guest experience · out of 100" />
            <Tile label="Listing quality" value={<ScoreValue score={s.qualityScore} />} hint="search readiness · out of 100" />
            <Tile label="Guest Favorite" value={s.guestFavorite ? "Yes" : "No"} />
            <Tile label="Photos" value={s.photoCount ?? "·"} hint={s.genericCaptions ? `${s.genericCaptions} without captions` : undefined} />
            <Tile label="Last checked" value={<span className="text-base">{formatClientDateTime(new Date(s.fetchedAt), tz)}</span>} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Issues and what to do ({s.issues.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {s.issues.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing to fix. This listing looks healthy.</p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {s.issues.map((i) => (
                    <li key={i.code} className="grid gap-1 py-3 text-sm md:grid-cols-[90px_1fr_auto] md:items-start">
                      <Badge tone={SEVERITY_TONE[i.severity]} className="h-fit w-fit">
                        {i.severity}
                      </Badge>
                      <div>
                        <p className="font-medium">{i.title}</p>
                        <p className="text-xs text-muted-foreground">{i.detail}</p>
                        <p className="mt-1 text-xs">
                          <span className="text-primary">Fix: </span>
                          {i.action}
                        </p>
                      </div>
                      {canManage && (
                        <FixTaskButton propertyId={property.id} issueKey={i.code} label={i.title} linked={linkedTasks[i.code]} people={people} />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {s.ok && (
            <div className="grid gap-3 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>Category ratings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {Object.entries(s.categories)
                    .sort((a, b) => (a[1] ?? 5) - (b[1] ?? 5))
                    .map(([k, v]) => (
                      <Bar key={k} label={CATEGORY_LABEL[k]} value={v !== null ? (v - 4) * 100 : 0} display={v?.toFixed(2) ?? "·"} tone={categoryBarTone(v)} />
                    ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Star breakdown</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {([5, 4, 3, 2, 1] as const).map((n) => (
                    <Bar
                      key={n}
                      label={`${n} star${n === 1 ? "" : "s"}`}
                      value={(s.starShares?.[String(n) as "5"] ?? 0) * 100}
                      display={s.estimatedStars ? `~${s.estimatedStars[String(n) as "5"]}` : "·"}
                      tone={n === 5 ? "bg-success" : n === 4 ? "bg-warning" : "bg-danger"}
                    />
                  ))}
                  <p className="pt-1 text-xs text-muted-foreground">
                    Estimated from Airbnb&apos;s percentages. {reviews.length > 0 ? `${reviews.length} reviews imported.` : "Import reviews to see the actual texts."}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Listing checklist</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5 text-sm">
                  <Check ok={(s.photoCount ?? 0) >= 25} text={`${s.photoCount ?? 0} photos (25+ recommended)`} />
                  <Check ok={!s.photoCount || (s.genericCaptions ?? 0) / s.photoCount <= 0.5} text={`${(s.photoCount ?? 0) - (s.genericCaptions ?? 0)} photos with real captions`} />
                  <Check ok={(s.descriptionLength ?? 0) >= 800} text={`Description ${s.descriptionLength ?? 0} characters (800+ recommended)`} />
                  <Check ok={!missing?.safety.length} text={missing?.safety.length ? `Safety items missing: ${missing.safety.join(", ")}` : "All safety items listed"} />
                  <Check ok={(missing?.key.length ?? 0) < 3} text={missing?.key.length ? `Not listed: ${missing.key.join(", ")}` : "All common amenities listed"} />
                  <Check ok={!s.issues.some((i) => i.code === "NO_RULES")} text="House rules in Knowledge Base" />
                  <Check ok={!s.issues.some((i) => i.code === "NO_CHECKIN_INFO")} text="Check-in instructions in Knowledge Base" />
                </CardContent>
              </Card>
            </div>
          )}

          <AiAssistant propertyId={property.id} ready={ai.ready} canManage={canManage} insights={ai.insights} copy={ai.copy} />

          <CheckinGuideCard
            propertyId={property.id}
            ready={ai.ready}
            canManage={canManage}
            templateGuide={templateGuide}
            aiGuide={ai.guide}
            secrets={secrets}
            checkinRating={s.ok ? s.categories.checkin : null}
          />

          {s.reviewTags.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>What guests mention most</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {s.reviewTags.map((t) => (
                  <Badge key={t.name} tone="primary">
                    {t.name} · {t.count}
                  </Badge>
                ))}
                <p className="w-full pt-1 text-xs text-muted-foreground">Airbnb&apos;s own summary of what reviews talk about.</p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>What the reviews say is wrong</CardTitle>
        </CardHeader>
        <CardContent>
          {reviews.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No reviews saved yet. {canManage ? "Use “Paste reviews” (copy Airbnb’s Reviews page), “Import CSV”, or turn on Review email sync in Settings." : ""}
            </p>
          ) : themes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No repeated complaints found in {reviews.length} reviews.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {themes.map((t) => (
                <div key={t.key} className="rounded-xl border border-border p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{t.label}</span>
                    <Badge tone="warning">
                      {t.reviews} review{t.reviews === 1 ? "" : "s"}
                    </Badge>
                  </div>
                  <ul className="mt-2 space-y-1">
                    {t.quotes.map((q, i) => (
                      <li key={i} className="text-xs text-muted-foreground">
                        “{q.text}” · {q.rating}★
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs">
                    <span className="text-primary">Fix: </span>
                    {t.action}
                  </p>
                  {canManage && (
                    <div className="mt-2">
                      <FixTaskButton propertyId={property.id} issueKey={`theme:${t.key}`} label={`${t.label} complaints`} linked={linkedTasks[`theme:${t.key}`]} people={people} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle>Reviews ({reviews.length})</CardTitle>
          <div role="tablist" aria-label="Filter by stars" className="flex flex-wrap gap-1">
            {(
              [
                ["low", `1 to 4★ (${byStar[1] + byStar[2] + byStar[3] + byStar[4]})`],
                [1, `1★ (${byStar[1]})`],
                [2, `2★ (${byStar[2]})`],
                [3, `3★ (${byStar[3]})`],
                [4, `4★ (${byStar[4]})`],
                [5, `5★ (${byStar[5]})`],
                ["all", `All (${reviews.length})`],
              ] as const
            ).map(([value, label]) => (
              <button
                key={String(value)}
                role="tab"
                aria-selected={starFilter === value}
                onClick={() => setStarFilter(value)}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-medium transition",
                  starFilter === value ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {shown.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">No reviews in this filter.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {shown.map((r) => (
                <li key={r.id} className="space-y-1.5 px-5 py-5 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Stars count={r.rating} />
                      <span className="text-xs text-muted-foreground">
                        {r.guestName ?? "Guest"} · {r.reviewDate ? formatClientDateTime(new Date(r.reviewDate), tz).split(",").slice(0, 2).join(",") : "no date"}
                      </span>
                      {r.themes.map((t) => (
                        <Badge key={t} tone="warning">
                          {t}
                        </Badge>
                      ))}
                    </div>
                    {canManage && (
                      <IconTooltip label="Delete review">
                        <button onClick={() => removeReview(r.id)} aria-label="Delete review" className="rounded-lg p-1.5 text-muted-foreground hover:bg-danger/10 hover:text-danger">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </IconTooltip>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap">{r.comment}</p>
                  {r.privateNote && (
                    <p className="rounded-lg bg-muted/30 px-3 py-2 text-xs">
                      <span className="text-muted-foreground">Private feedback: </span>
                      {r.privateNote}
                    </p>
                  )}
                  {r.rating <= 4 && <ReviewReply propertyId={property.id} reviewId={r.id} ready={ai.ready} canManage={canManage} reply={ai.replies[r.id]} />}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {history.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Rating history</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {history.map((h) => (
              <div key={h.fetchedAt} className="flex justify-between text-muted-foreground">
                <span>{formatClientDateTime(new Date(h.fetchedAt), tz)}</span>
                <span className="tabular-nums">
                  {h.rating?.toFixed(2) ?? "·"} · {h.reviewCount ?? 0} reviews · health {h.healthScore ?? "·"}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <AddReviewDialog open={addOpen} onOpenChange={setAddOpen} propertyId={property.id} />
      <PasteReviewsDialog
        open={pasteOpen}
        onOpenChange={setPasteOpen}
        clientId={property.clientId}
        propertyId={property.id}
        listingLabel={property.internalName}
        listings={[]}
        aiReady={ai.ready}
      />
      <ImportReviewsDialog open={importOpen} onOpenChange={setImportOpen} clientId={property.clientId} propertyId={property.id} listingLabel={property.internalName} />
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="glass rounded-2xl px-5 py-3 shadow-card">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="mt-3 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}

function ScoreValue({ score }: { score: number | null }) {
  const tone = scoreTone(score);
  const color = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : tone === "danger" ? "text-danger" : "";
  return <span className={color}>{score ?? "·"}</span>;
}

function Check({ ok, text }: { ok: boolean; text: string }) {
  return (
    <p className="flex items-start gap-2">
      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />}
      <span className={ok ? "text-muted-foreground" : ""}>{text}</span>
    </p>
  );
}
