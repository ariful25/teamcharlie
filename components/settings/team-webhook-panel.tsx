"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Circle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/shared/form-field";

// For any team other than the deployment's home team: one Discord incoming
// webhook receives task, attendance and export notifications. The saved URL
// is never sent back to the browser — only whether one is set.
export function TeamWebhookPanel({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(value: string) {
    setBusy(true);
    const res = await fetch("/api/settings/team", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ discordWebhookUrl: value }),
    });
    setBusy(false);
    if (res.ok) {
      toast.success(value ? "Webhook saved" : "Webhook removed");
      setUrl("");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Could not save the webhook");
    }
  }

  async function test() {
    setBusy(true);
    const res = await fetch("/api/settings/discord-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "team" }),
    });
    setBusy(false);
    if (res.ok) toast.success("Test message sent — check your Discord channel");
    else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Test failed");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/20 px-3 py-2 text-sm">
        <span className="flex items-center gap-2">
          {configured ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
          {configured ? "Discord webhook connected" : "No webhook yet — notifications are off"}
        </span>
        {configured && (
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={test}>
              Send test
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => confirm("Remove the webhook? Notifications will stop.") && save("")}
            >
              Remove
            </Button>
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          save(url.trim());
        }}
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
      >
        <Field label={configured ? "Replace webhook URL" : "Discord webhook URL"} className="flex-1">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
            placeholder="https://discord.com/api/webhooks/…"
            className={inputClass}
            autoComplete="off"
          />
        </Field>
        <Button type="submit" disabled={busy || !url.trim()} className="h-10">
          Save
        </Button>
      </form>
      <p className="text-xs text-muted-foreground">
        In Discord: Channel settings → Integrations → Webhooks → New Webhook → Copy Webhook URL. Task updates,
        check-ins/outs, and knowledge-base exports for your team are posted there.
      </p>
    </div>
  );
}
