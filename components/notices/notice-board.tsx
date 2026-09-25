"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Pin, PinOff, Archive, ArchiveRestore, Trash2, StickyNote, Check } from "lucide-react";
import { toast } from "sonner";
import { IconTooltip } from "@/components/ui/tooltip";
import { NoticeComposer } from "@/components/notices/notice-composer";
import { NOTICE_COLOR_STYLES } from "@/components/notices/notice-colors";

type ChecklistItem = { id: string; text: string; checked: boolean };

type Notice = {
  id: string;
  content: string;
  color: string;
  pinned: boolean;
  archived: boolean;
  checklist: ChecklistItem[] | null;
  createdAt: string;
  author: { id: string; name: string; avatarUrl: string | null };
};

function NoticeCard({ notice, canPinNotices, canManage }: { notice: Notice; canPinNotices: boolean; canManage: boolean }) {
  const router = useRouter();
  // Local optimistic copies, same pattern as components/tasks/task-card.tsx.
  // `hidden` covers both archive and unarchive — either action removes the
  // card from whichever tab it's currently shown in, so a single "left this
  // view" boolean is simpler than tracking archived state and re-filtering.
  const [pinned, setPinned] = useState(notice.pinned);
  const [checklist, setChecklist] = useState(notice.checklist);
  const [hidden, setHidden] = useState(false);
  const style = NOTICE_COLOR_STYLES[notice.color] ?? NOTICE_COLOR_STYLES.YELLOW;

  function togglePin() {
    const previous = pinned;
    const next = !pinned;
    setPinned(next);
    fetch(`/api/notices/${notice.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: next }),
    }).then((res) => {
      if (res.ok) {
        router.refresh();
      } else {
        setPinned(previous);
        toast.error("Could not update notice — change reverted");
      }
    });
  }

  function toggleArchive() {
    setHidden(true);
    fetch(`/api/notices/${notice.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: !notice.archived }),
    }).then((res) => {
      if (res.ok) {
        toast.success(notice.archived ? "Notice restored" : "Notice archived");
        router.refresh();
      } else {
        setHidden(false);
        toast.error("Could not update notice — change reverted");
      }
    });
  }

  function toggleItem(itemId: string) {
    if (!checklist) return;
    const previous = checklist;
    const next = checklist.map((i) => (i.id === itemId ? { ...i, checked: !i.checked } : i));
    setChecklist(next);
    fetch(`/api/notices/${notice.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checklist: next }),
    }).then((res) => {
      if (res.ok) {
        router.refresh();
      } else {
        setChecklist(previous);
        toast.error("Could not update item — change reverted");
      }
    });
  }

  async function handleDelete() {
    if (!confirm("Delete this notice? This can't be undone.")) return;
    const res = await fetch(`/api/notices/${notice.id}`, { method: "DELETE" });
    if (res.ok) {
      // Deletion isn't optimistic — the note only disappears once the
      // server confirms, matching the app-wide "never optimistic for
      // deletes" rule.
      setHidden(true);
      toast.success("Notice deleted");
      router.refresh();
    } else {
      toast.error("Could not delete notice");
    }
  }

  if (hidden) return null;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      className={`group mb-4 break-inside-avoid rounded-xl border border-black/5 p-4 shadow-md ${style.card}`}
    >
      {pinned && (
        <div className="mb-1 flex justify-end">
          <Pin className="h-3.5 w-3.5 rotate-45 fill-current opacity-70" />
        </div>
      )}

      {checklist ? (
        <ul className="space-y-1.5">
          {checklist.map((item) => (
            <li key={item.id} className="flex items-start gap-2 text-sm">
              <button
                onClick={() => toggleItem(item.id)}
                aria-label={item.checked ? `Mark "${item.text}" as not done` : `Mark "${item.text}" as done`}
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 border-current ${
                  item.checked ? "bg-current" : ""
                }`}
              >
                {item.checked && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
              </button>
              <span className={`break-words font-medium leading-snug ${item.checked ? "opacity-50 line-through" : ""}`}>
                {item.text}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="whitespace-pre-wrap break-words text-sm font-medium leading-snug">{notice.content}</p>
      )}

      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs opacity-70">
          {notice.author.name} · {new Date(notice.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </span>
        <div className="flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
          {canPinNotices && !notice.archived && (
            <IconTooltip label={pinned ? "Unpin notice" : "Pin notice"}>
              <button onClick={togglePin} aria-label={pinned ? "Unpin notice" : "Pin notice"} className="rounded-lg p-1 hover:bg-black/10">
                {pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
              </button>
            </IconTooltip>
          )}
          {canManage && (
            <IconTooltip label={notice.archived ? "Restore notice" : "Archive notice"}>
              <button
                onClick={toggleArchive}
                aria-label={notice.archived ? "Restore notice" : "Archive notice"}
                className="rounded-lg p-1 hover:bg-black/10"
              >
                {notice.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
              </button>
            </IconTooltip>
          )}
          {canManage && (
            <IconTooltip label="Delete notice">
              <button onClick={handleDelete} aria-label="Delete notice" className="rounded-lg p-1 hover:bg-black/10">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </IconTooltip>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export function NoticeBoard({
  notices,
  currentUserId,
  currentUserRole,
  canPinNotices,
}: {
  notices: Notice[];
  currentUserId: string;
  currentUserRole: string;
  canPinNotices: boolean;
}) {
  const [tab, setTab] = useState<"board" | "archive">("board");

  const filtered = notices.filter((n) => (tab === "board" ? !n.archived : n.archived));
  // Pinned-first, newest-first — mirrors the API route's own orderBy, so
  // this only matters for re-sorting after an optimistic pin toggle above.
  const sorted = [...filtered].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  const archivedCount = notices.filter((n) => n.archived).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-center gap-1 rounded-full border border-border p-1 text-sm w-fit mx-auto">
        <button
          onClick={() => setTab("board")}
          className={`rounded-full px-4 py-1.5 transition ${tab === "board" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          Board
        </button>
        <button
          onClick={() => setTab("archive")}
          className={`rounded-full px-4 py-1.5 transition ${tab === "archive" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          Archive {archivedCount > 0 && `(${archivedCount})`}
        </button>
      </div>

      {tab === "board" && <NoticeComposer />}

      {sorted.length === 0 ? (
        <div className="glass flex flex-col items-center justify-center gap-2 rounded-2xl p-12 text-center text-muted-foreground">
          <StickyNote className="h-8 w-8" />
          <p className="text-sm">{tab === "board" ? "No notices yet. Post the first one for the team." : "No archived notices."}</p>
        </div>
      ) : (
        <div className="columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4">
          {sorted.map((notice) => (
            <NoticeCard
              key={notice.id}
              notice={notice}
              canPinNotices={canPinNotices}
              canManage={notice.author.id === currentUserId || currentUserRole === "ADMIN"}
            />
          ))}
        </div>
      )}
    </div>
  );
}
