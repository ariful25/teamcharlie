// Browser error monitoring (Sentry). Loaded only when NEXT_PUBLIC_SENTRY_DSN
// is set, as a separate chunk, so pages don't carry the SDK otherwise.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  import("@sentry/nextjs").then((Sentry) =>
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
      tracesSampleRate: 0,
      sendDefaultPii: false,
    })
  );
}
