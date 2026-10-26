"use client";

import { useEffect, useSyncExternalStore } from "react";

// Chrome/Edge/Android fire `beforeinstallprompt` once, early, often before
// the button that uses it is on screen, so it's kept here at module level.
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

/** Registers the service worker (public/sw.js). Production only: in dev it would serve stale chunks over hot reload. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}

export type InstallState =
  | { kind: "installed" }
  | { kind: "prompt"; install: () => Promise<void> }
  | { kind: "ios" } // Safari has no prompt: Share, then Add to Home Screen
  | { kind: "unavailable" };

function read(): InstallState {
  if (typeof window === "undefined") return { kind: "unavailable" };
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  if (standalone) return { kind: "installed" };
  if (deferred) return { kind: "prompt", install };
  if (/iPhone|iPad|iPod/.test(navigator.userAgent)) return { kind: "ios" };
  return { kind: "unavailable" };
}

async function install() {
  if (!deferred) return;
  const e = deferred;
  await e.prompt();
  await e.userChoice;
  deferred = null;
  notify();
}

let snapshot: InstallState = { kind: "unavailable" };
function getSnapshot() {
  const next = read();
  if (next.kind !== snapshot.kind) snapshot = next;
  return snapshot;
}
const serverSnapshot: InstallState = { kind: "unavailable" };

export function useInstallState(): InstallState {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    getSnapshot,
    () => serverSnapshot
  );
}
