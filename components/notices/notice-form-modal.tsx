"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogTrigger, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/shared/form-field";
import { NOTICE_COLORS } from "@/lib/validations";
import { NOTICE_COLOR_STYLES } from "@/components/notices/notice-colors";

export function NoticeFormModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [content, setContent] = useState("");
  const [color, setColor] = useState<(typeof NOTICE_COLORS)[number]>("YELLOW");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);

    const res = await fetch("/api/notices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, color }),
    });

    setSubmitting(false);
    if (res.ok) {
      toast.success("Notice posted");
      setContent("");
      setColor("YELLOW");
      setOpen(false);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Could not post notice");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg" className="shadow-glow">
          <Plus className="h-4 w-4" /> Add Notice
        </Button>
      </DialogTrigger>
      <DialogContent title="Post a Notice">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Message">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
              maxLength={500}
              rows={4}
              autoFocus
              className="w-full rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm outline-none focus:glow-border"
              placeholder="e.g. Guest WiFi password template is in the shared drive."
            />
          </Field>

          <Field label="Color">
            <div className="flex flex-wrap gap-2">
              {NOTICE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`${c.charAt(0)}${c.slice(1).toLowerCase()} note`}
                  onClick={() => setColor(c)}
                  className={`h-8 w-8 rounded-full transition ${NOTICE_COLOR_STYLES[c].swatch} ${
                    color === c ? "ring-2 ring-offset-2 ring-offset-card ring-primary" : "opacity-70 hover:opacity-100"
                  }`}
                />
              ))}
            </div>
          </Field>

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Posting..." : "Post Notice"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
