"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Pin, PinOff, Trash2, StickyNote } from "lucide-react";
import { toast } from "sonner";
import { IconTooltip } from "@/components/ui/tooltip";
import { NoticeFormModal } from "@/components/notices/notice-form-modal";
import { NOTICE_COLOR_STYLES } from "@/components/notices/notice-colors";

type Notice = {
  id: string;
  content: string;
  color: string;
  pinned: boolean;
  createdAt: string;
  author: { id: string; name: string; avatarUrl: string | null };
};

// A stable, deterministic "tape angle" per note (derived from its id) so
// notes look hand-pinned rather than perfectly aligned — but never
// re-randomizes on every render/refresh, which would make the board jitter.
function tiltFor(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return (hash % 5) - 2; // -2..2 degrees
}

function NoticeCard({ notice, canPinNotices, canDelete }: { notice: Notice; canPinNotices: boolean; canDelete: boolean }) {
  const router = useRouter();
  // Local optimistic copies, same pattern as components/tasks/task-card.tsx —
  // this is what actually renders, so pinning/deleting feels instant instead
  // of waiting on the round-trip. The board itself stays a plain map over
  // the `notices` prop (no board-level copy) so a newly-created or
  // server-deleted notice always shows up on the next router.refresh().
  const [pinned, setPinned] = useState(notice.pinned);
  const [isDeleted, setIsDeleted] = useState(false);
  const style = NOTICE_COLOR_STYLES[notice.color] ?? NOTICE_COLOR_STYLES.YELLOW;
  const tilt = tiltFor(notice.id);

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

  async function handleDelete() {
    if (!confirm("Delete this notice? This can't be undone.")) return;
    const res = await fetch(`/api/notices/${notice.id}`, { method: "DELETE" });
    if (res.ok) {
      // Deletion isn't optimistic — the note only disappears once the
      // server confirms, matching the app-wide "never optimistic for
      // deletes" rule.
      setIsDeleted(true);
      toast.success("Notice deleted");
      router.refresh();
    } else {
      toast.error("Could not delete notice");
    }
  }

  if (isDeleted) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0, rotate: tilt }}
      whileHover={{ rotate: 0, y: -3, scale: 1.02 }}
      className={`group relative flex aspect-square flex-col justify-between rounded-lg p-4 shadow-lg ${style.card}`}
    >
      <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
        {canPinNotices && (
          <IconTooltip label={pinned ? "Unpin notice" : "Pin notice"}>
            <button onClick={togglePin} aria-label={pinned ? "Unpin notice" : "Pin notice"} className="rounded-lg p-1 hover:bg-black/10">
              {pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
            </button>
          </IconTooltip>
        )}
        {canDelete && (
          <IconTooltip label="Delete notice">
            <button onClick={handleDelete} aria-label="Delete notice" className="rounded-lg p-1 hover:bg-black/10">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </IconTooltip>
        )}
      </div>

      {pinned && <Pin className="absolute left-1/2 top-0 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rotate-45 fill-current" />}

      <p className="whitespace-pre-wrap break-words text-sm font-medium leading-snug">{notice.content}</p>

      <div className="mt-2 flex items-center justify-between text-xs opacity-70">
        <span className="font-semibold">{notice.author.name}</span>
        <span>{new Date(notice.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
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
  // Pinned-first, newest-first — mirrors the API route's own orderBy, so
  // this only matters for re-sorting after an optimistic pin toggle above.
  const sorted = [...notices].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <NoticeFormModal />
      </div>

      {sorted.length === 0 ? (
        <div className="glass flex flex-col items-center justify-center gap-2 rounded-2xl p-12 text-center text-muted-foreground">
          <StickyNote className="h-8 w-8" />
          <p className="text-sm">No notices yet. Post the first one for the team.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {sorted.map((notice) => (
            <NoticeCard
              key={notice.id}
              notice={notice}
              canPinNotices={canPinNotices}
              canDelete={notice.author.id === currentUserId || currentUserRole === "ADMIN"}
            />
          ))}
        </div>
      )}
    </div>
  );
}
