# Charlie HQ — Team Charlie Operations Center

Internal operations platform for Team Charlie at STR Assistance (Module 1.1).

Built with Next.js 14 (App Router), TypeScript, Tailwind CSS, Prisma + PostgreSQL,
NextAuth, Framer Motion, anime.js, and React Three Fiber.

## What's included (Module 1.1)

- Auth (email/password via NextAuth credentials) with Admin / Team Lead / Employee roles
- Dashboard: greeting header, animated stat cards, client status cards, Today's
  Operations table, live shift check-in/check-out card, team attendance widget, optional
  3D client visualization (desktop only)
- **Shift Schedule** (`/shift-schedule`): the team's real weekly roster — Morning
  (08:00–17:00), Evening (17:00–01:00), Night (00:00–08:00), and Backup (19:00–03:00)
  shifts, fully editable in Settings. A week-by-week grid grouped by shift, each
  employee's day marked Working/Weekend/Leave with optional per-day time overrides and
  notes, a daily headcount row, a "Copy Last Week" action, and an optional 3D "Shift
  Ring" hero visualization showing the selected date clearly with employee chips
  arranged around a 24-hour arc.
- Tasks: filterable board, Quick Add modal with a "Repeat" option — recurrence lives
  directly on the Task row (no separate template entity), auto-overdue marking
- Attendance: check-in/check-out with live timer, double check-in/out prevention,
  monthly totals, per-employee history, manual corrections with audit trail — expected
  times now come from the Shift Schedule (see below)
- Discord integration — webhook notifications, DB-write-first/Discord-second failure
  handling, admin retry, test buttons in Settings
- Settings: Discord config, Shift Types management, and admin user management (add
  user with a one-time temp password, edit role, deactivate/reactivate)
- Custom animated dropdown (`components/ui/select.tsx`, built on Radix) used for every
  select in the app
- Clients — Andrea/Allen/Shawn fully wired, Perfect Stay/Jack as placeholders per spec
- Issues
- **Property Knowledge Base** (`/knowledge-base`): lightweight Airbnb listing
  preparation tool for client onboarding. Bulk import internal property names +
  Airbnb URLs, run best-effort public listing extraction, review/fill operational
  fields, and export CSV for Google Sheets / NotebookLM. This intentionally does not
  add embeddings, chatbots, or a heavy AI knowledge system inside Charlie HQ.

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in:

- `DATABASE_URL` — a PostgreSQL connection string (local Postgres, Supabase, Neon,
  Railway, etc. all work)
- `DIRECT_URL` — only needed if `DATABASE_URL` points at a connection pooler (e.g.
  Supabase's pgbouncer/session-pooler port 6543); set this to the non-pooled/direct
  connection instead (port 5432). If you're on a plain direct connection, just set it
  to the same value as `DATABASE_URL` — Prisma needs a direct connection to run
  `db push`/migrations.
- `NEXTAUTH_SECRET` — generate with `openssl rand -base64 32`
- `DISCORD_CHECKIN_WEBHOOK_URL` / `DISCORD_CHECKOUT_WEBHOOK_URL` — create two Discord
  webhooks (Server Settings → Integrations → Webhooks) pointed at your check-in and
  check-out channels. These are read server-side only and are never sent to the browser.

### 3. Set up the database

```bash
npm run db:push     # creates tables from prisma/schema.prisma
npm run db:seed      # seeds Team Charlie, users, clients, shift types, this week's roster, tasks
```

`db:seed` is idempotent — running it again after the app has been used will not
duplicate the seeded rows (it upserts by stable ids).

### 4. Run it

```bash
npm run dev
```

Visit `http://localhost:3000`. Seeded logins (password `charliehq123` for all):

- `admin@strassistance.com` — Admin
- `lead@strassistance.com` — Team Lead
- `john@strassistance.com` — Employee
- `sarah@strassistance.com` — Employee

### 5. Deploy to Vercel

Import this repository into Vercel with the project root set to the repository root.
The default Next.js framework preset and build command are sufficient; `npm run build`
generates the Prisma Client before compiling Next.js.

Add these environment variables in Vercel for the Production environment:

- `DATABASE_URL` — Supabase pooler URL, normally port `6543` with `pgbouncer=true`
- `DIRECT_URL` — Supabase direct database URL, normally port `5432`
- `NEXTAUTH_URL` — the deployed Vercel URL
- `NEXTAUTH_SECRET` — a new random production secret
- `TEAM_TIMEZONE` and `NEXT_PUBLIC_TEAM_TIMEZONE` — normally `Asia/Dhaka`
- `DISCORD_CHECKIN_WEBHOOK_URL` and `DISCORD_CHECKOUT_WEBHOOK_URL` — optional webhooks

Before the first production deployment, apply the Prisma schema to the production
database with `npm run db:push` using the production environment values, then run
`npm run db:seed` once if the database is empty. Do not commit `.env` or place real
credentials in `.env.example`.

## Project structure

```
app/
  (app)/                 # authenticated route group (shared sidebar layout)
    dashboard/
    shift-schedule/
    tasks/
    attendance/
      [userId]/          # per-employee history
    clients/
      [id]/              # per-client workspace
    issues/
    settings/
  api/                    # route handlers (server-only business logic)
  login/
components/
  layout/                 # sidebar, mobile nav
  dashboard/  shift-schedule/  tasks/  attendance/  clients/  issues/  settings/
  ui/                     # button, card, badge, dialog, select primitives
lib/
  services/               # task-generation.ts, attendance.ts, shift-schedule.ts
  queries/                # server-side data-fetching helpers
  auth.ts                 # NextAuth config + role permission map
  session.ts              # getCurrentUser()/getCurrentUserOrNull() — the one place
                           # Server Components/routes read the session from
  discord.ts              # server-only Discord webhook sender
  time.ts                 # timezone-safe date + week helpers (Asia/Dhaka by default)
  validations.ts          # Zod schemas
prisma/
  schema.prisma
  seed.ts
```

## Design notes / how the architecture stays modular

- **Recurring tasks, folded in**: there is no separate "Routine" entity. A `Task` can
  be marked `isRecurringTemplate: true` with a `repeatMode`/`repeatDays`, and
  `lib/services/task-generation.ts` spawns a plain (non-template) `Task` row for each
  future day it's due. Editing a generated instance never mutates the template it came
  from, and editing the template only affects instances generated after the edit.
- **Shift Schedule is the source of truth for attendance**: `ShiftType` (Morning /
  Evening / Night / Backup — admin-editable, not hardcoded) and `ShiftAssignment` (one
  row per employee per specific calendar day: Working / Weekend / Leave, with optional
  per-day time overrides) together model the team's actual weekly roster.
  `lib/services/attendance.ts` reads expected check-in/check-out times from today's
  `ShiftAssignment` — a day marked Weekend/Leave, or with no assignment, has no
  scheduled time, so nothing is marked "late" against nothing.
- **Attendance + Discord**: `lib/services/attendance.ts` always writes the attendance
  record to Postgres *before* attempting the Discord webhook call. If Discord fails, the
  record is kept with `discordCheckInSynced: false` and the error message stored, and an
  Admin/Team Lead can retry from the Attendance page — a Discord outage can never
  destroy a check-in/check-out.
- **Timezone**: all timestamps are stored in UTC; every display conversion goes through
  `lib/time.ts`, which reads `TEAM_TIMEZONE` (defaults to `Asia/Dhaka`).
- **Roles**: permission checks live in one place (`lib/auth.ts` `permissions` map) and
  are enforced server-side in every API route, not just hidden in the UI.
- **Sessions**: every Server Component/route gets the current user via
  `lib/session.ts`'s `getCurrentUser()` (redirects to `/login` on a null session) or
  `getCurrentUserOrNull()` (for API routes that need to return 401 instead) — avoids the
  fragile `session!.user` pattern that could throw on refresh/direct-visit races.
- **Multi-team ready**: every core model (`User`, `Client`, `Task`, `Issue`,
  `ShiftAssignment`) is scoped by `teamId` (via its user/team relation). Adding
  Alpha/Bravo/Delta later means seeding more `Team` rows and building their dashboards —
  it does not require restructuring Team Charlie's data.

## What's intentionally NOT built yet (per spec, "Do Not Build Yet")

Airbnb/Guestly/WhatsApp/ClickUp/Zillow API integrations, payroll, leave management, full
HR, advanced analytics, AI messaging, and the full Perfect Stay LTR/STR workflow.
Perfect Stay and Jack are seeded as placeholder client workspaces only, as specified.

## Known simplifications worth knowing about

- Overdue-task detection and recurring-task generation run on dashboard page load
  rather than a background cron — fine for a small team checking the dashboard
  throughout the day, but for a fully hands-off system you'd want a scheduled job (e.g.
  a Vercel Cron Job) calling `generateRecurringTaskInstances()` / `refreshOverdueTasks()`
  on a timer.
- The 3D Shift Ring is built with plain Three.js primitives (arcs, spheres) — no
  external 3D model files are required. It's hidden below the `lg` breakpoint and never
  blocks the 2D grid, which is the real day-to-day tool.
- Discord Bot Token / channel ID env vars are declared in `.env.example` for future use
  but the current implementation uses webhooks (simpler, sufficient for one-way
  notifications).
- New users are created with a randomly generated temporary password shown once in the
  Settings UI — there's no outbound email/invite flow yet (no email infrastructure in
  Module 1).
- The Property Knowledge Base extractor reads only public Airbnb page metadata on a
  best-effort basis. Airbnb may change markup or block requests, so the review step and
  manual operational fields remain first-class parts of the workflow.
