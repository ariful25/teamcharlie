"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Download, ExternalLink, ClipboardPaste, RefreshCw, Search, Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { IconTooltip } from "@/components/ui/tooltip";
import { useTeamTimezone } from "@/components/providers/team-timezone";
import { formatClientDateTime } from "@/lib/time";
import type { PortfolioRow } from "@/lib/listing-health/queries";
import { Bar, Rating, SEVERITY_TONE, ScoreBadge, categoryBarTone } from "./shared";
import { ImportReviewsDialog } from "./review-dialogs";
import { PasteReviewsDialog } from "./paste-reviews";
import { ReviewInbox, type InboxItem } from "./review-inbox";

type Summary = {
  listings: number;
  checked: number;
  unreachable: number;
  neverChecked: number;
  averageRating: number | null;
  averageHealth: number | null;
  averageQuality: number | null;
  below48: number;
  guestFavorites: number;
  totalReviews: number;
  estimatedLowStars: Record<1 | 2 | 3 | 4, number>;
  categoryAverages: { key: string; label: string; average: number | null; below48: number }[];
  topIssues: { code: string; title: string; severity: string; listings: number; action: string }[];
  importedReviews: number;
  themes: { key: string; label: string; reviews: number; action: string; quotes: { rating: number; text: string }[] }[];
};

type Filter = "all" | "attention" | "unreachable" | "unchecked";
type Sort = "health" | "rating" | "lowstars" | "quality" | "name";

const LABEL: Record<string, string> = {
  cleanliness: "Cleanliness",
  accuracy: "Accuracy",
  checkin: "Check-in",
  communication: "Communication",
  location: "Location",
  value: "Value",
};

function weakest(row: PortfolioRow) {
  const cats = row.snapshot?.categories;
  if (!cats) return null;
  let worst: [string, number] | null = null;
  for (const [k, v] of Object.entries(cats)) if (v !== null && (!worst || v < worst[1])) worst = [k, v];
  return worst;
}

function needsAttention(row: PortfolioRow) {
  const s = row.snapshot;
  if (!s) return false;
  return !s.ok || (s.healthScore !== null && s.healthScore < 60) || s.issues.some((i) => i.severity === "high");
}

export function ListingHealthPortfolio({
  clients,
  clientId,
  rows,
  summary,
  canManage,
  aiReady,
  inbox,
  teamListings,
}: {
  clients: { id: string; name: string }[];
  clientId: string;
  rows: PortfolioRow[];
  summary: Summary;
  canManage: boolean;
  aiReady: boolean;
  inbox: InboxItem[];
  teamListings: { id: string; name: string }[];
}) {
  const tz = useTeamTimezone();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("health");
  const [progress, setProgress] = useState<{ done: number; total: number; failed: number } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);

  async function runChecks(onlyIds?: string[]) {
    const ids = onlyIds ?? rows.map((r) => r.id);
    let done = 0;
    let failed = 0;
    setProgress({ done, total: ids.length, failed });
    const queue = [...ids];
    // Two at a time — fast enough for ~70 listings, gentle on Airbnb.
    const worker = async () => {
      while (queue.length) {
        const id = queue.shift()!;
        try {
          const res = await fetch(`/api/listing-health/${id}/refresh`, { method: "POST" });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || data.ok === false) failed++;
        } catch {
          failed++;
        }
        done++;
        setProgress({ done, total: ids.length, failed });
      }
    };
    await Promise.all([worker(), worker()]);
    toast.success(failed ? `Checked ${done} listings — ${failed} couldn't be read` : `Checked ${done} listings`);
    setProgress(null);
    router.refresh();
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter((r) => {
      if (q && !`${r.internalName} ${r.listingName ?? ""}`.toLowerCase().includes(q)) return false;
      if (filter === "attention") return needsAttention(r);
      if (filter === "unreachable") return r.snapshot ? !r.snapshot.ok : false;
      if (filter === "unchecked") return !r.snapshot;
      return true;
    });
    const lowStars = (r: PortfolioRow) => {
      const e = r.snapshot?.estimatedStars;
      return e ? e["1"] + e["2"] + e["3"] : -1;
    };
    return list.sort((a, b) => {
      switch (sort) {
        case "rating":
          return (a.snapshot?.rating ?? 6) - (b.snapshot?.rating ?? 6);
        case "lowstars":
          return lowStars(b) - lowStars(a);
        case "quality":
          return (a.snapshot?.qualityScore ?? 101) - (b.snapshot?.qualityScore ?? 101);
        case "name":
          return a.internalName.localeCompare(b.internalName);
        default:
          return (a.snapshot?.healthScore ?? 101) - (b.snapshot?.healthScore ?? 101);
      }
    });
  }, [rows, query, filter, sort]);

  const est = summary.estimatedLowStars;

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Listing Health</h1>
          <p className="mt-1 max-w-[68ch] text-sm text-muted-foreground">
            Ratings, review problems and listing quality for every property in the Knowledge Base. Checked listings are re-checked automatically every week.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <Select
            className="w-[180px]"
            value={clientId}
            onValueChange={(id) => router.push(`/listing-health?clientId=${id}`)}
            options={clients.map((c) => ({ value: c.id, label: c.name }))}
          />
          {canManage && (
            <>
              <Button variant="secondary" onClick={() => setPasteOpen(true)}>
                <ClipboardPaste className="h-4 w-4" /> Paste reviews
              </Button>
              <Button variant="secondary" onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4" /> Import CSV
              </Button>
              <Button onClick={() => runChecks()} disabled={!!progress || rows.length === 0}>
                <RefreshCw className={`h-4 w-4 ${progress ? "animate-spin" : ""}`} />
                {progress ? `Checking ${progress.done}/${progress.total}` : "Run health check"}
              </Button>
            </>
          )}
        </div>
      </div>

      {canManage && <ReviewInbox items={inbox} listings={teamListings} />}

      {progress && (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted/50">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
        </div>
      )}

      {summary.checked === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            {rows.length === 0
              ? "This client has no listings in the Knowledge Base yet."
              : `No health checks yet for these ${rows.length} listings. ${canManage ? "Press “Run health check” to read their ratings and reviews from Airbnb (about a minute)." : "Ask a team lead to run the first health check."}`}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Tile label="Listings checked" value={`${summary.checked}/${summary.listings}`} hint={summary.unreachable ? `${summary.unreachable} unreachable` : undefined} />
            <Tile label="Average rating" value={summary.averageRating?.toFixed(2) ?? "—"} hint={`${summary.totalReviews.toLocaleString()} reviews`} />
            <Tile label="Below 4.8" value={summary.below48} hint="listings" tone={summary.below48 ? "text-warning" : undefined} />
            <Tile label="Guest Favorites" value={summary.guestFavorites} />
            <Tile label="Avg health" value={summary.averageHealth !== null ? Math.round(summary.averageHealth) : "—"} hint="guest experience" />
            <Tile label="Avg listing quality" value={summary.averageQuality !== null ? Math.round(summary.averageQuality) : "—"} hint="search readiness" />
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Low-star reviews (estimated)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs text-muted-foreground">From Airbnb&apos;s star breakdown across all listings.</p>
                {([4, 3, 2, 1] as const).map((n) => (
                  <Bar key={n} label={`${n} star${n === 1 ? "" : "s"}`} value={(est[n] / Math.max(1, est[4] + est[3] + est[2] + est[1])) * 100} display={`~${est[n]}`} tone={n >= 4 ? "bg-warning" : "bg-danger"} />
                ))}
                <a href={`/api/listing-health/reviews?clientId=${clientId}&maxRating=4`} className="inline-flex items-center gap-1 pt-1 text-xs text-primary hover:underline">
                  <Download className="h-3 w-3" /> Download imported 1–4★ reviews (CSV)
                </a>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Weakest categories</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {summary.categoryAverages.map((c) => (
                  <Bar
                    key={c.key}
                    label={c.label}
                    value={c.average !== null ? ((c.average - 4) / 1) * 100 : 0}
                    display={c.average?.toFixed(2) ?? "—"}
                    tone={categoryBarTone(c.average)}
                  />
                ))}
                <p className="pt-1 text-xs text-muted-foreground">
                  {summary.categoryAverages[0]?.below48 ?? 0} listings score {summary.categoryAverages[0]?.label.toLowerCase()} below 4.8.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Most common issues</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {summary.topIssues.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No issues found.</p>
                ) : (
                  summary.topIssues.map((i) => (
                    <div key={i.code} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2">
                        <Badge tone={SEVERITY_TONE[i.severity]}>{i.severity}</Badge>
                        {i.title}
                      </span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{i.listings}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>What guests complain about</CardTitle>
            </CardHeader>
            <CardContent>
              {summary.importedReviews === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Airbnb doesn&apos;t show review texts on the public page, so complaints need the reviews themselves. Import a review CSV
                  (Guesty or another PMS export) or add reviews on a listing&apos;s page — this then lists the repeated problems with real
                  guest quotes.
                </p>
              ) : summary.themes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No repeated complaints found in {summary.importedReviews} imported reviews.</p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {summary.themes.map((t) => (
                    <div key={t.key} className="rounded-xl border border-border p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{t.label}</span>
                        <Badge tone="warning">{t.reviews} review{t.reviews === 1 ? "" : "s"}</Badge>
                      </div>
                      {t.quotes[0] && <p className="mt-1.5 text-xs text-muted-foreground">“{t.quotes[0].text}” · {t.quotes[0].rating}★</p>}
                      <p className="mt-1.5 text-xs">{t.action}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <CardTitle>Listings ({visible.length})</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search listings…" aria-label="Search listings" className="w-40 bg-transparent text-sm outline-none" />
            </div>
            <Select
              className="w-[170px]"
              value={filter}
              onValueChange={(v) => setFilter(v as Filter)}
              options={[
                { value: "all", label: "All listings" },
                { value: "attention", label: "Needs attention" },
                { value: "unreachable", label: "Unreachable" },
                { value: "unchecked", label: "Not checked yet" },
              ]}
            />
            <Select
              className="w-[170px]"
              value={sort}
              onValueChange={(v) => setSort(v as Sort)}
              options={[
                { value: "health", label: "Worst health first" },
                { value: "rating", label: "Lowest rating first" },
                { value: "lowstars", label: "Most low-star reviews" },
                { value: "quality", label: "Lowest listing quality" },
                { value: "name", label: "Name" },
              ]}
            />
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-y border-border/60 text-left text-xs text-muted-foreground">
                <th className="px-5 py-2.5 font-medium">Listing</th>
                <th className="px-3 py-2.5 font-medium">Rating</th>
                <th className="px-3 py-2.5 font-medium">Health</th>
                <th className="px-3 py-2.5 font-medium">Quality</th>
                <th className="px-3 py-2.5 font-medium">Weakest area</th>
                <th className="px-3 py-2.5 font-medium">Est. 4★ / 3★ / 2★ / 1★</th>
                <th className="px-3 py-2.5 font-medium">Top issue</th>
                <th className="px-3 py-2.5 font-medium">Checked</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const s = r.snapshot;
                const w = weakest(r);
                const trend = s?.rating !== null && s?.rating !== undefined && r.previousRating !== null ? s.rating - r.previousRating : 0;
                return (
                  <tr key={r.id} className="border-b border-border/40 last:border-0 hover:bg-muted/20">
                    <td className="max-w-[280px] px-5 py-3">
                      <Link href={`/listing-health/${r.id}`} className="block truncate font-medium hover:text-primary">
                        {r.internalName}
                      </Link>
                      <span className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                        {r.listingName ?? "—"}
                        <IconTooltip label="Open on Airbnb">
                          <a href={r.airbnbUrl} target="_blank" rel="noreferrer" aria-label="Open on Airbnb" className="shrink-0 hover:text-primary">
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </IconTooltip>
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {s?.ok ? (
                        <span className="flex items-center gap-1">
                          <Rating value={s.rating} />
                          {Math.abs(trend) >= 0.01 && (trend < 0 ? <ArrowDown className="h-3 w-3 text-danger" /> : <ArrowUp className="h-3 w-3 text-success" />)}
                          <span className="text-xs text-muted-foreground">({s.reviewCount ?? 0})</span>
                        </span>
                      ) : s ? (
                        <Badge tone="danger">Unreachable</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">{s?.ok ? <ScoreBadge score={s.healthScore} /> : "—"}</td>
                    <td className="px-3 py-3">{s?.ok ? <ScoreBadge score={s.qualityScore} /> : "—"}</td>
                    <td className="px-3 py-3 text-muted-foreground">{w ? `${LABEL[w[0]]} ${w[1].toFixed(2)}` : "—"}</td>
                    <td className="px-3 py-3 tabular-nums text-muted-foreground">
                      {s?.estimatedStars ? `${s.estimatedStars["4"]} / ${s.estimatedStars["3"]} / ${s.estimatedStars["2"]} / ${s.estimatedStars["1"]}` : "—"}
                      {r.imported.total > 0 && <span className="ml-2 text-xs text-primary">{r.imported.total} imported</span>}
                    </td>
                    <td className="max-w-[220px] px-3 py-3">
                      {s?.issues[0] ? <span className="block truncate text-xs">{s.issues[0].title}</span> : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{s ? formatClientDateTime(new Date(s.fetchedAt), tz) : "Never"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <ImportReviewsDialog open={importOpen} onOpenChange={setImportOpen} clientId={clientId} />
      <PasteReviewsDialog
        open={pasteOpen}
        onOpenChange={setPasteOpen}
        clientId={clientId}
        aiReady={aiReady}
        listings={rows.map((r) => ({ id: r.id, name: r.internalName }))}
      />
    </div>
  );
}

function Tile({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: string }) {
  return (
    <div className="glass rounded-2xl px-5 py-3 shadow-card">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className={`mt-3 text-2xl font-semibold tabular-nums ${tone ?? ""}`}>{value}</div>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}
