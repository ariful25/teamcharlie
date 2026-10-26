// TeamHQ service worker. Deliberately small:
// - Pages and API responses are never cached. They are per-user, per-team
//   data and must not be readable from the phone's cache after sign-out.
// - Next's hashed build files (/_next/static) are immutable and public, so
//   they're cached to make the installed app start faster.
// - With no connection, a page load shows /offline.html instead of the
//   browser's error page.
const VERSION = "v2";
const STATIC = `static-${VERSION}`;
const OFFLINE = `offline-${VERSION}`;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(OFFLINE).then((c) => c.add("/offline.html")).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC && k !== OFFLINE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(STATIC).then((cache) =>
        cache.match(req).then(
          (hit) =>
            hit ||
            fetch(req).then((res) => {
              if (res.ok) cache.put(req, res.clone());
              return res;
            })
        )
      )
    );
  }
});

// Notifications (lib/push/send.ts). The payload is { title, body, url, tag };
// a newer push with the same tag replaces the older one instead of stacking.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data && event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "TeamHQ", {
      body: data.body || "",
      tag: data.tag,
      icon: "/app-icon/192",
      data: { url: data.url || "/dashboard" },
    })
  );
});

// Tapping one opens its page, reusing an open TeamHQ window if there is one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/dashboard", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const win = wins.find((w) => new URL(w.url).origin === self.location.origin);
      // navigate() fails on a window this worker doesn't control yet.
      if (win) return win.focus().then((w) => (w || win).navigate(url)).catch(() => self.clients.openWindow(url));
      return self.clients.openWindow(url);
    })
  );
});
