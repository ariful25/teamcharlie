"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Field, inputClass } from "@/components/shared/form-field";
import { REQUEST_KIND_LABEL, type RequestKind } from "@/lib/portal/rules";

// The owner's one way to change anything: a request to their team. It lands
// on the team's task board; the owner never edits live data.
export function RequestForm({ listings, propertyId, defaultKind = "KNOWLEDGE_BASE" }: { listings: { id: string; name: string }[]; propertyId?: string; defaultKind?: RequestKind }) {
  const router = useRouter();
  const [kind, setKind] = useState<RequestKind>(defaultKind);
  const [listing, setListing] = useState(propertyId ?? "");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch("/api/portal/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, message, propertyId: listing || null }),
    });
    setBusy(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(data.error ?? "Couldn't send that");
    toast.success("Sent to your team");
    setMessage("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="About">
          <Select value={kind} onValueChange={(v) => setKind(v as RequestKind)} options={Object.entries(REQUEST_KIND_LABEL).map(([value, label]) => ({ value, label }))} />
        </Field>
        {!propertyId && listings.length > 0 && (
          <Field label="Listing">
            <Select value={listing} onValueChange={setListing} placeholder="All my listings" options={[{ value: "", label: "All my listings" }, ...listings.map((l) => ({ value: l.id, label: l.name }))]} />
          </Field>
        )}
      </div>
      <Field label="What do you need?">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          required
          minLength={3}
          maxLength={2000}
          rows={4}
          placeholder="For example: the Wi-Fi password changed, or please add the new coffee machine to the amenities."
          className={inputClass}
        />
      </Field>
      <Button type="submit" disabled={busy || message.trim().length < 3}>
        <Send className="h-4 w-4" /> {busy ? "Sending..." : "Send to my team"}
      </Button>
    </form>
  );
}
