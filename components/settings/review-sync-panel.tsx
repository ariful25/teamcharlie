"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTeamTimezone } from "@/components/providers/team-timezone";
import { formatClientDateTime } from "@/lib/time";
import { appsScript } from "@/lib/reviews/apps-script";

type Status = { connected: boolean; tokenHint: string | null; lastSeenAt: string | null; saved: number; needsReview: number; ignored: number };

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
      toast.error("Couldn't copy. Select the text instead.");
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
              Choose <b>setUp</b> in the function menu and press <b>Run</b>. Allow access when Google asks. It&apos;s your own script.
            </li>
            <li>That&apos;s it: new emails arrive every hour, and the past year comes in a chunk at a time over the next hours (Gmail limits how much a script may read per day).</li>
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
