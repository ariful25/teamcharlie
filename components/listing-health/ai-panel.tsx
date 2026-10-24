"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Eye, EyeOff, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconTooltip } from "@/components/ui/tooltip";
import { useTeamTimezone } from "@/components/providers/team-timezone";
import { formatClientDateTime } from "@/lib/time";

type Note<T> = { content: T; model: string; createdAt: string } | null;
type Insights = { summary: string; priorities: { title: string; why: string; steps: string[]; owner: string }[]; quickWins: string[] };
type CopyIdeas = { titles: string[]; opening: string; highlights: string[]; captionIdeas: string[] };

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  } catch {
    toast.error("Couldn't copy — select the text instead");
  }
}

function useRun(propertyId: string) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  async function run(kind: string, reviewId?: string) {
    setBusy(reviewId ?? kind);
    const res = await fetch(`/api/listing-health/${propertyId}/ai`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, reviewId }),
    });
    setBusy(null);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error ?? "AI request failed");
      return false;
    }
    toast.success("Done");
    router.refresh();
    return true;
  }
  return { busy, run };
}

/** AI insights + listing copy ideas for one listing. */
export function AiAssistant({
  propertyId,
  ready,
  canManage,
  insights,
  copy,
}: {
  propertyId: string;
  ready: boolean;
  canManage: boolean;
  insights: Note<Insights>;
  copy: Note<CopyIdeas>;
}) {
  const tz = useTeamTimezone();
  const { busy, run } = useRun(propertyId);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" /> AI assistant
        </CardTitle>
        {canManage && ready && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => run("COPY")}>
              {busy === "COPY" ? "Writing…" : copy ? "New title & description ideas" : "Suggest title & description"}
            </Button>
            <Button size="sm" disabled={!!busy} onClick={() => run("INSIGHTS")}>
              {busy === "INSIGHTS" ? "Analysing…" : insights ? "Re-analyse" : "Analyse with AI"}
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!ready && (
          <p className="text-muted-foreground">
            AI isn&apos;t connected for this team.{" "}
            {canManage ? (
              <>
                An admin can add an Anthropic or OpenAI key in{" "}
                <Link href="/settings" className="text-primary hover:underline">
                  Settings → AI
                </Link>
                .
              </>
            ) : (
              "Ask an admin to connect it."
            )}
          </p>
        )}
        {ready && !insights && !copy && (
          <p className="text-muted-foreground">
            “Analyse with AI” reads the ratings, issues and imported reviews and writes a prioritised action plan. Results are saved
            here — nothing is regenerated unless you ask.
          </p>
        )}

        {insights && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-medium">Action plan</p>
              <span className="text-xs text-muted-foreground">
                {insights.model} · {formatClientDateTime(new Date(insights.createdAt), tz)}
              </span>
            </div>
            <p>{insights.content.summary}</p>
            <ol className="space-y-3">
              {insights.content.priorities.map((p, i) => (
                <li key={i} className="rounded-xl border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {i + 1}. {p.title}
                    </span>
                    {p.owner && <Badge tone="primary">{p.owner}</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{p.why}</p>
                  <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs">
                    {p.steps.map((step, j) => (
                      <li key={j}>{step}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
            {insights.content.quickWins.length > 0 && (
              <div>
                <p className="font-medium">Quick wins</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
                  {insights.content.quickWins.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {copy && (
          <div className="space-y-3 border-t border-border/60 pt-5">
            <div className="flex items-center justify-between">
              <p className="font-medium">Title &amp; description ideas</p>
              <span className="text-xs text-muted-foreground">{copy.model}</span>
            </div>
            <ul className="space-y-1.5">
              {copy.content.titles.map((t) => (
                <li key={t} className="flex items-center justify-between gap-2 rounded-lg bg-muted/30 px-3 py-2">
                  <span>{t}</span>
                  <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                    {t.length}/50
                    <IconTooltip label="Copy title">
                      <button onClick={() => copyText(t)} aria-label="Copy title" className="rounded p-1 hover:text-primary">
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </IconTooltip>
                  </span>
                </li>
              ))}
            </ul>
            {copy.content.opening && <p className="rounded-lg bg-muted/30 px-3 py-2">{copy.content.opening}</p>}
            {copy.content.highlights.length > 0 && (
              <ul className="list-disc space-y-0.5 pl-5 text-xs">
                {copy.content.highlights.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            )}
            {copy.content.captionIdeas.length > 0 && (
              <p className="text-xs text-muted-foreground">Photo captions: {copy.content.captionIdeas.join(" · ")}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Arrival guide: template from the Knowledge Base, optionally rewritten by AI. */
export function CheckinGuideCard({
  propertyId,
  ready,
  canManage,
  templateGuide,
  aiGuide,
  secrets,
  checkinRating,
}: {
  propertyId: string;
  ready: boolean;
  canManage: boolean;
  templateGuide: string;
  aiGuide: Note<{ text: string }>;
  secrets: { doorCode: string | null; wifiName: string | null; wifiPassword: string | null };
  checkinRating: number | null;
}) {
  const { busy, run } = useRun(propertyId);
  const [reveal, setReveal] = useState(false);
  const raw = aiGuide?.content.text ?? templateGuide;
  const fill = (text: string, show: boolean) =>
    // Hidden mode also masks codes typed into the Knowledge Base free text
    // ("lockbox code 4821"), not just the placeholders.
    (show ? text : text.replace(/\b\d{4,8}\b/g, "••••"))
      .replace(/\{\{DOOR_CODE\}\}/g, show ? secrets.doorCode || "[team: add door code]" : "••••")
      .replace(/\{\{WIFI_NAME\}\}/g, show ? secrets.wifiName || "[team: add Wi-Fi name]" : "••••")
      .replace(/\{\{WIFI_PASSWORD\}\}/g, show ? secrets.wifiPassword || "[team: add Wi-Fi password]" : "••••");

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <CardTitle>
          Check-in guide{" "}
          {checkinRating !== null && checkinRating < 4.8 && (
            <Badge tone="warning" className="ml-2">
              Check-in {checkinRating.toFixed(2)}
            </Badge>
          )}
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <IconTooltip label={reveal ? "Hide codes" : "Show codes"}>
            <Button size="icon" variant="outline" aria-label={reveal ? "Hide codes" : "Show codes"} onClick={() => setReveal((v) => !v)}>
              {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </IconTooltip>
          <Button size="sm" variant="secondary" onClick={() => copyText(fill(raw, true))}>
            <Copy className="h-3.5 w-3.5" /> Copy for guests
          </Button>
          {canManage && ready && (
            <Button size="sm" disabled={!!busy} onClick={() => run("CHECKIN_GUIDE")}>
              <Sparkles className="h-3.5 w-3.5" /> {busy ? "Writing…" : aiGuide ? "Rewrite again" : "Improve with AI"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <p className="mb-2 text-xs text-muted-foreground">
          {aiGuide
            ? `Rewritten by AI (${aiGuide.model}) from the Knowledge Base and guest complaints. Codes are filled in here, never sent to the AI.`
            : "Built from this listing's Knowledge Base fields. “[team: add …]” marks missing details."}
        </p>
        <pre className="whitespace-pre-wrap rounded-xl bg-muted/30 p-5 font-sans text-sm">{fill(raw, reveal)}</pre>
      </CardContent>
    </Card>
  );
}

/** "Draft reply" under a review. */
export function ReviewReply({ propertyId, reviewId, ready, canManage, reply }: { propertyId: string; reviewId: string; ready: boolean; canManage: boolean; reply?: { text: string } }) {
  const { busy, run } = useRun(propertyId);
  if (!reply && !(canManage && ready)) return null;
  return (
    <div className="space-y-1.5">
      {reply && (
        <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-xs">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-muted-foreground">Suggested public reply</span>
            <IconTooltip label="Copy reply">
              <button onClick={() => copyText(reply.text)} aria-label="Copy reply" className="rounded p-1 text-muted-foreground hover:text-primary">
                <Copy className="h-3.5 w-3.5" />
              </button>
            </IconTooltip>
          </div>
          <p className="whitespace-pre-wrap">{reply.text}</p>
        </div>
      )}
      {canManage && ready && (
        <button onClick={() => run("REVIEW_REPLY", reviewId)} disabled={!!busy} className="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-50">
          <Sparkles className="h-3 w-3" /> {busy ? "Writing…" : reply ? "Rewrite reply" : "Draft reply with AI"}
        </button>
      )}
    </div>
  );
}
