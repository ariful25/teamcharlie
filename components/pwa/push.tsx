"use client";

import { useCallback, useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { toast } from "sonner";
import { Bell, BellOff } from "lucide-react";
import { cn } from "@/lib/utils";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

type PushState = "loading" | "not-set-up" | "unsupported" | "install-first" | "blocked" | "off" | "on";

function keyBytes(base64url: string) {
  const b64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function currentSubscription() {
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

function usePush() {
  const [state, setState] = useState<PushState>("loading");

  const refresh = useCallback(async () => {
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    // No VAPID key in this deployment yet: nothing to switch on, so stay hidden.
    if (!PUBLIC_KEY) return setState("not-set-up");
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    // iPhones only allow web notifications for apps added to the home screen.
    if (ios && !standalone) return setState("install-first");
    if (!supported) return setState("unsupported");
    if (Notification.permission === "denied") return setState("blocked");
    setState((await currentSubscription()) ? "on" : "off");
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const enable = async () => {
    if ((await Notification.requestPermission()) !== "granted") return refresh();
    try {
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(PUBLIC_KEY) }));
      const res = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub.toJSON()) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't turn notifications on");
      toast.success("Notifications are on for this device");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't turn notifications on");
    }
    refresh();
  };

  const disable = async () => {
    const sub = await currentSubscription();
    if (sub) {
      await fetch("/api/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
      await sub.unsubscribe().catch(() => {});
    }
    toast.success("Notifications are off for this device");
    refresh();
  };

  return { state, enable, disable };
}

const HINT: Record<PushState, string> = {
  loading: "",
  "not-set-up": "Not set up on this server yet: the VAPID keys in .env.example need adding to the deployment.",
  unsupported: "This browser can't show notifications from TeamHQ.",
  "install-first": "On iPhone, add TeamHQ to your home screen first, then turn notifications on from there.",
  blocked: "Notifications are blocked for TeamHQ. Allow them in this browser's site settings, then come back.",
  off: "New tasks for you, leave decisions and team notices.",
  on: "On for this device. New tasks for you, leave decisions and team notices.",
};

/** Notifications switch for this device: More sheet on phones, Settings everywhere. */
export function PushToggle({ className, explainSetup = false }: { className?: string; explainSetup?: boolean }) {
  const { state, enable, disable } = usePush();
  const [busy, setBusy] = useState(false);
  if (state === "loading" || (state === "not-set-up" && !explainSetup)) return null;
  const on = state === "on";
  const canToggle = state === "on" || state === "off";
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };
  return (
    <div className={cn("flex items-start gap-3 rounded-xl bg-muted/20 px-3 py-3 text-sm", className)}>
      {on ? <Bell className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : <BellOff className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
      <div className="min-w-0 flex-1">
        <p className="font-medium">Notifications</p>
        <p className="text-xs text-muted-foreground">{HINT[state]}</p>
      </div>
      {canToggle && (
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Notifications on this device"
          disabled={busy}
          onClick={() => run(on ? disable : enable)}
          className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50", on ? "bg-primary" : "bg-muted")}
        >
          <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-background transition-all", on ? "left-[22px]" : "left-0.5")} />
        </button>
      )}
    </div>
  );
}

/** Signing out also stops this device getting the user's notifications. */
export async function signOutOfDevice() {
  try {
    const sub = "serviceWorker" in navigator ? await currentSubscription() : null;
    if (sub) {
      await fetch("/api/push", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
      await sub.unsubscribe();
    }
  } catch {
    // Never block signing out.
  }
  await signOut({ callbackUrl: "/login?signedOut=1" });
}
