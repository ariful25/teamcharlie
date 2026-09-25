# Charlie HQ

An operations platform for Team Charlie / STR Assistance — a short-term-rental
management team. Modules: Tasks, Notices, Properties/Units/Tenancies, Leads,
Attendance/Shift Schedule, the Property Knowledge Base (Airbnb listing data,
synced one-way to a per-client Google Sheet for NotebookLM), and per-client
Google Sheets/Drive integration.

## Architecture

- Next.js 14 App Router. Pages are **async Server Components that call Prisma
  directly** — there is no client-side data-fetching library (no React
  Query/SWR) and none should be added. Mutations go through API routes; after
  a mutation, client components call `router.refresh()` to re-run the
  server component's fetch — never `window.location.reload()` (a full reload
  loses scroll position and flashes white; every prior instance of this in
  the codebase has been replaced).
- Auth: NextAuth v4, JWT sessions, credentials provider only (no social
  login is configured — never add a "Sign in with Google" button or similar
  without actually wiring a real provider). Route protection runs through
  `getCurrentUser()`/`getCurrentUserOrNull()` (`lib/session.ts`) at each
  protected layout/route — there is no `middleware.ts`; don't add a second,
  parallel protection mechanism.
- **Every query must be scoped by `teamId`** (multi-tenant). Never trust a
  `clientId` from the browser alone — always verify
  `client.teamId === session.teamId` server-side before reading or writing.
  See `app/api/clients/[id]/*` routes for the established pattern
  (`prisma.client.findFirst({ where: { id, teamId } })` before touching
  anything client-scoped).
- Database migrations: real Prisma migrations live in `prisma/migrations/`
  and are generated via `prisma migrate diff` (no live DB connection
  required) rather than hand-written. `prisma migrate deploy` runs as part
  of `npm run build`, so a normal Vercel deploy applies pending migrations
  automatically — don't reintroduce `db push`-only workflows.

## Design language — don't reinvent it per page

Charlie HQ already has an established visual identity in `app/globals.css`
and `tailwind.config.ts`. Reuse these tokens; don't hardcode new colors.

- Primary color is a **cyan/sky accent** (`hsl(189 94% 55%)`), dark navy
  background (`hsl(222 47% 6%)`). Not blue, not any color from a design
  reference image — this app's actual brand.
- The `.glass` (frosted, translucent panels) and `.glow-border` (soft accent
  glow) utility classes are the core aesthetic — used on every card, modal,
  and the login page. New UI should use them, not introduce a competing
  style.
- No stock photography anywhere in the product today — the look is dark,
  gradient/glow-driven, abstract. If a page genuinely calls for a real photo
  (e.g. a marketing/landing surface), that's a deliberate exception to
  discuss, not a default.
- Feel: premium, operational, enterprise SaaS — closer to Linear/Notion than
  a consumer app. Prioritize clarity over decoration.
- Icon-only buttons always need both an `aria-label` and a wrapped
  `IconTooltip` (`components/ui/tooltip.tsx`) — see
  `components/knowledge-base/knowledge-base-manager.tsx` for the pattern.
  Primary actions keep visible text ("+ Add Client"); secondary actions can
  be icon-only, never bare.
- Loading states use `loading.tsx` per route (Next.js's own Suspense
  fallback) with the shared skeleton primitives in `components/ui/skeleton.tsx`
  shaped to match the real layout — not a generic spinner or gray blocks.
- For any non-trivial UI build or redesign, follow the `production-ui-workflow`
  skill (installed globally): real assets over placeholders, test at
  mobile/tablet/desktop widths, screenshot via the Playwright or Chrome
  DevTools MCP server and self-critique before calling it done.

## Optimistic UI

Only for actions that are safe and reversible: status toggles, task
completion, issue status changes (see `components/tasks/task-card.tsx`,
`components/issues/issue-status-button.tsx` for the pattern — local state
update, then rollback on a failed request). Never optimistic: deletes,
client creation, financial actions, integration/sync operations, permission
changes.

## Credentials

Never put real secrets in `.env.example` — it's tracked by git. Real values
go in `.env` only (gitignored). Google Sheets sync
(`lib/google-sheets/`) supports both OAuth2-as-a-real-account and a service
account; a bare service account cannot create Drive files without a Google
Workspace Shared Drive (confirmed by testing — fails with
`storageQuotaExceeded` otherwise), so this team's setup uses OAuth2.

## Before considering a change done

- `npx tsc --noEmit`, `npm run lint`, and `npx next build` should all pass.
- For anything touching real external state (production DB, Google APIs,
  auth), prefer verifying against a live dev server or a real API call over
  trusting the build alone — this project's history has repeatedly found
  real bugs (a session-expiry gap, a storage-quota architecture problem)
  that only showed up under actual execution, not static checks.
