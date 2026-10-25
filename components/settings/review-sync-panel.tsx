"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTeamTimezone } from "@/components/providers/team-timezone";
import { formatClientDateTime } from "@/lib/time";

type Status = { connected: boolean; tokenHint: string | null; lastSeenAt: string | null; saved: number; needsReview: number; ignored: number };

/** The Google Apps Script the team pastes into script.google.com. */
function appsScript(url: string, token: string) {
  return `// TeamHQ — Airbnb review email sync.
// Runs inside your own Gmail: finds Airbnb review emails and sends only
// those to TeamHQ. Nothing else in the mailbox is read or sent.
const TEAMHQ_URL = '${url}';
const TEAMHQ_TOKEN = '${token}';
const SEARCH = 'from:(airbnb.com) subject:(review)';

// Runs every hour (see setUp): the last 3 days, duplicates are skipped.
function syncRecent() { send_(SEARCH + ' newer_than:3d'); }

// One-off: imports the last year of review emails.
function backfillLastYear() { send_(SEARCH + ' newer_than:365d'); }

function send_(query) {
  for (let start = 0; start < 2000; start += 40) {
    const threads = GmailApp.search(query, start, 40);
    if (!threads.length) return;
    const messages = [];
    threads.forEach(function (t) {
      t.getMessages().forEach(function (m) {
        messages.push({ id: m.getId(), subject: m.getSubject(), from: m.getFrom(), date: m.getDate().toISOString(), body: m.getPlainBody().slice(0, 40000) });
      });
    });
    for (let i = 0; i < messages.length; i += 40) {
      const res = UrlFetchApp.fetch(TEAMHQ_URL, {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + TEAMHQ_TOKEN },
        payload: JSON.stringify({ messages: messages.slice(i, i + 40) }),
        muteHttpExceptions: true,
      });
      Logger.log(res.getResponseCode() + ' ' + res.getContentText());
      if (res.getResponseCode() !== 200) return;
    }
  }
}

// Run this once: schedules the hourly sync and imports the past year.
function setUp() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('syncRecent').timeBased().everyHours(1).create();
  backfillLastYear();
}
`;
}

export function ReviewSyncPanel({ initial }: { initial: Status }) {
  const router = useRouter();
  const tz = useTeamTimezone();
  const [token, setToken] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => setOrigin(window.location.origin), []);

  async function create() {
    if (initial.connected && !confirm("Create a new key? The script using the old key stops working until you paste the new one.")) return;
    setBusy(true);
    const res = await fetch("/api/settings/review-inbox", { method: "POST" });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(data.error ?? "Couldn't create the key");
    setToken(data.token);
    router.refresh();
  }

  async function disable() {
    if (!confirm("Turn off review email sync? The script stops being accepted.")) return;
    setBusy(true);
    const res = await fetch("/api/settings/review-inbox", { method: "DELETE" });
    setBusy(false);
    if (!res.ok) return toast.error("Couldn't turn it off");
    setToken(null);
    toast.success("Review email sync turned off");
    router.refresh();
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Script copied");
    } catch {
      toast.error("Couldn't copy — select the text instead");
    }
  }

  const script = token ? appsScript(`${origin}/api/inbound/reviews`, token) : "";

  return (
    <div className="space-y-5 text-sm">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ["Status", initial.connected ? `On · key …${initial.tokenHint}` : "Off"],
            ["Last email", initial.lastSeenAt ? formatClientDateTime(new Date(initial.lastSeenAt), tz) : "None yet"],
            ["Reviews saved", String(initial.saved)],
            ["Waiting in inbox", String(initial.needsReview)],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="rounded-xl border border-border bg-muted/20 px-3 py-2">
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="mt-0.5 font-medium">{v}</dd>
          </div>
        ))}
      </dl>

      {!token ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={create} disabled={busy}>
            <KeyRound className="h-4 w-4" /> {initial.connected ? "Create a new key and script" : "Set up review email sync"}
          </Button>
          {initial.connected && (
            <Button variant="ghost" onClick={disable} disabled={busy}>
              Turn off
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>
              Sign in to the Gmail that receives Airbnb&apos;s emails, then open{" "}
              <a href="https://script.google.com/home/projects/create" target="_blank" rel="noreferrer" className="text-primary hover:underline">
                script.google.com → New project
              </a>
              .
            </li>
            <li>Delete what&apos;s there, paste the script below and press Save.</li>
            <li>
              Choose <b>setUp</b> in the function menu and press <b>Run</b>. Allow access when Google asks — it&apos;s your own script.
            </li>
            <li>That&apos;s it: the past year of review emails comes in now, new ones every hour.</li>
          </ol>
          <div className="relative">
            <pre className="max-h-72 overflow-auto rounded-xl border border-border bg-muted/30 p-3 text-[11px] leading-relaxed">{script}</pre>
            <Button size="sm" variant="secondary" className="absolute right-2 top-2" onClick={() => copy(script)}>
              <Copy className="h-3.5 w-3.5" /> Copy script
            </Button>
          </div>
          <p className="text-xs text-warning">The key inside the script is shown only now. If you lose it, create a new one.</p>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Emails that don&apos;t include the full review, or can&apos;t be matched to a listing, wait in the Review inbox on the Listing Health page for
        someone to finish.
      </p>
    </div>
  );
}
