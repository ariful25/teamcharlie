"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ListChecks, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { NOTICE_COLORS } from "@/lib/validations";
import { NOTICE_COLOR_STYLES } from "@/components/notices/notice-colors";

type Item = { id: string; text: string; checked: boolean };

function newItem(): Item {
  return { id: crypto.randomUUID(), text: "", checked: false };
}

// A Google-Keep-style "Take a note..." bar: collapsed to a single pill,
// expands in place into the composer, and — like Keep — clicking away
// posts whatever was drafted instead of discarding it (there's no separate
// cancel; an empty draft just collapses back down).
export function NoticeComposer() {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<"text" | "checklist">("text");
  const [content, setContent] = useState("");
  const [color, setColor] = useState<(typeof NOTICE_COLORS)[number]>("YELLOW");
  const [items, setItems] = useState<Item[]>([]);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setExpanded(false);
    setMode("text");
    setContent("");
    setColor("YELLOW");
    setItems([]);
  }

  function openText() {
    setMode("text");
    setExpanded(true);
  }

  function openChecklist() {
    setMode("checklist");
    setItems([newItem()]);
    setExpanded(true);
  }

  async function post() {
    const trimmedContent = content.trim();
    const cleanItems = items.map((i) => ({ ...i, text: i.text.trim() })).filter((i) => i.text.length > 0);

    if (mode === "text" && !trimmedContent) return reset();
    if (mode === "checklist" && cleanItems.length === 0) return reset();

    setSubmitting(true);
    const res = await fetch("/api/notices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: mode === "text" ? trimmedContent : "",
        color,
        checklist: mode === "checklist" ? cleanItems : undefined,
      }),
    });
    setSubmitting(false);

    if (res.ok) {
      toast.success("Notice posted");
      reset();
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Could not post notice");
    }
  }

  // Clicking away behaves like Google Keep: a non-empty draft gets posted,
  // an empty one just collapses.
  useEffect(() => {
    if (!expanded) return;
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        post();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, content, items, mode, color]);

  function updateItem(id: string, text: string) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, text } : i)));
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  function handleItemKeyDown(e: React.KeyboardEvent<HTMLInputElement>, index: number) {
    if (e.key === "Enter") {
      e.preventDefault();
      setItems((prev) => {
        const next = [...prev];
        next.splice(index + 1, 0, newItem());
        return next;
      });
    } else if (e.key === "Backspace" && items[index].text === "" && items.length > 1) {
      e.preventDefault();
      removeItem(items[index].id);
    }
  }

  if (!expanded) {
    return (
      <div
        className="glass mx-auto flex max-w-xl cursor-text items-center justify-between rounded-full px-5 py-3 shadow-card transition hover:shadow-glow-sm"
        onClick={openText}
      >
        <span className="text-sm text-muted-foreground">Take a note...</span>
        <button
          type="button"
          aria-label="New checklist note"
          onClick={(e) => {
            e.stopPropagation();
            openChecklist();
          }}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
        >
          <ListChecks className="h-4 w-4" />
        </button>
      </div>
    );
  }

  const style = NOTICE_COLOR_STYLES[color];

  return (
    <div
      ref={rootRef}
      className={`mx-auto max-w-xl rounded-xl p-4 shadow-glow-sm ${style.card}`}
    >
      {mode === "text" ? (
        <textarea
          autoFocus
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Take a note..."
          className="w-full resize-none bg-transparent text-sm font-medium outline-none placeholder:text-current placeholder:opacity-60"
        />
      ) : (
        <div className="space-y-1.5">
          {items.map((item, i) => (
            <div key={item.id} className="flex items-center gap-2">
              <span className="h-4 w-4 shrink-0 rounded border-2 border-current opacity-50" />
              <input
                autoFocus={i === items.length - 1}
                value={item.text}
                onChange={(e) => updateItem(item.id, e.target.value)}
                onKeyDown={(e) => handleItemKeyDown(e, i)}
                placeholder="List item"
                className="w-full bg-transparent text-sm font-medium outline-none placeholder:text-current placeholder:opacity-60"
              />
              {items.length > 1 && (
                <button
                  type="button"
                  aria-label="Remove item"
                  onClick={() => removeItem(item.id)}
                  className="shrink-0 rounded p-0.5 opacity-50 hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => setItems((prev) => [...prev, newItem()])}
            className="flex items-center gap-2 pt-1 text-xs opacity-60 hover:opacity-100"
          >
            <Plus className="h-3.5 w-3.5" /> Add item
          </button>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-current/10 pt-3">
        <div className="flex flex-wrap gap-1.5">
          {NOTICE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`${c.charAt(0)}${c.slice(1).toLowerCase()} note`}
              onClick={() => setColor(c)}
              className={`h-5 w-5 rounded-full ${NOTICE_COLOR_STYLES[c].swatch} ${
                color === c ? "ring-2 ring-offset-1 ring-current" : "opacity-70 hover:opacity-100"
              }`}
            />
          ))}
        </div>
        <button
          type="button"
          disabled={submitting}
          onClick={post}
          className="rounded-lg px-3 py-1.5 text-sm font-medium opacity-80 hover:bg-black/10 hover:opacity-100 disabled:opacity-40"
        >
          Close
        </button>
      </div>
    </div>
  );
}
