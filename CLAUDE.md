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

## Attendance & overtime

The rules (auto-stop after 10h, lead approval for missed punches, the
next-check-in lock, overtime only via approved requests, no self-approval)
are written down in `docs/attendance-rules.md`. Pure logic lives in
`lib/attendance/rules.ts` — run `npm run test:attendance` after touching it.
Raw punches (`actualCheckIn/Out`) are never overwritten; approved times go in
`effectiveCheckIn/Out` and every decision is audited (`AttendanceAudit`).

## Listing Health

`/listing-health` scores every Knowledge Base listing from its public Airbnb
page (rating, category scores, star distribution, photos, amenities) — see
`lib/listing-health/`. Review texts aren't on the public page: they come from
CSV import or manual entry (`ListingReview`), never from Airbnb's private
APIs. Without a PMS API, reviews also arrive by **paste** (text copied from
Airbnb's Reviews page → preview → save) and **review email sync** (a Google
Apps Script in the team's Gmail posts Airbnb review emails to
`/api/inbound/reviews` with a per-team token; only its hash is stored).
Readers are in `lib/listing-health/review-text.ts` (pure, tested); anything
they can't read with confidence waits in the Review inbox for a person —
ratings are never guessed. Scoring, review-theme analysis and CSV parsing are pure functions —
run `npm run test:listing-health` after touching them. Health checks are
throttled to one fetch per listing per 10 minutes.

## AI, leave and payroll

- AI: every call goes through `runAi()` (`lib/ai/client.ts`) — team's own
  Anthropic/OpenAI key (encrypted via `lib/crypto.ts`), on/off switch, daily
  limit, `AiUsage` log. Never send door codes, Wi-Fi details or internal notes
  to a provider (`redactCodes`, `{{DOOR_CODE}}` placeholders in
  `lib/listing-health/ai.ts`).
- Leave (`lib/leave/service.ts`): approval writes leave statuses onto
  `ShiftAssignment` and stores what it replaced so revoking restores it.
- Payroll (`lib/payroll/`): pure maths in `calc.ts` (`npm run test:payroll`);
  a month can't be finalized while shifts still need review.

## Reviews pipeline

`/reviews` tracks every Airbnb guest from booking to review (`lib/reviews/`,
`npm run test:reviews`). Airbnb's emails (via the Gmail Apps Script →
`/api/inbound/reviews`) create and update `GuestStay` rows: confirmed /
altered / cancelled / "write a review for…" / "… left a review". Guest
message threads are never ingested (OTHER emails keep no body). Stages and
rules are pure in `pipeline.ts`; each stage gets at most one open task
(`sourceRef stay:<id>:<step>`), and completing that task on the Tasks board
advances the stay (`onStayTaskCompleted`). Messages are sent by people in
Airbnb/Akia — the app never messages guests. Templates must stay inside
Airbnb's Reviews Policy (no incentives, pressure or review swaps —
`policyWarnings()` flags them).

## Task board visibility

`lib/tasks/visibility.ts` decides what's on the board (`npm run test:tasks`):
completed tasks stay 5 minutes (undo window) then move to History;
recurring tasks that belong to a shift appear when that shift starts and
are never marked overdue before then; one-off tasks and shift-less
recurring tasks are there from the start of the team's day. The dashboard's
operations table uses the same rules; its stats still count the whole day.

## People

`/people` is the directory (cards + org chart) and `/people/[userId]` the
profile (job, about, personal, emergency contacts, document links, time &
leave, history). Who sees/edits what is one pure function,
`profileAccess()` in `lib/people/access.ts` — run `npm run test:people` after
touching it. Hidden fields are omitted server-side in `lib/people/queries.ts`,
never just hidden in the UI. Job-field changes are logged as
`EmployeeEvent`s automatically.

## Design language — don't reinvent it per page

- Type: IBM Plex Sans for UI text, Archivo (slightly expanded via
  `font-stretch`) for headings and big figures — never Inter/Geist. Sizes
  are golden-ratio steps in `tailwind.config.ts`; two-pane layouts split
  1 : 1.618. Labels are sentence case, never tracked all-caps.
- Golden-ratio rhythm (`tailwind.config.ts`): spacing steps 2/3/5/8/14 are
  8/13/21/34/55px (Fibonacci). Page sections `space-y-8` (34), cards and
  sections `space-y-5`/`p-5` (21), content inside them `gap-3` (13). Don't
  use the off-rhythm 4 and 6 for spacing. Main + aside layouts use
  `grid-cols-golden` / `grid-cols-golden-r`; radii nest 2xl 21 → xl 13 →
  lg 8. Stat tiles are `px-5 py-3` so they sit near a 1.618 rectangle.
  Wide tables go full width below a golden split, not inside its narrow side.
- Shifts are shown as a 24-hour dial (`components/attendance/shift-dial.tsx`),
  people as a ringed avatar (`components/people/person-avatar.tsx`) — reuse
  these rather than adding progress bars.

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
