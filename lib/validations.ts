import { z } from "zod";
import { isAirbnbUrl, MANUAL_KNOWLEDGE_STATUSES } from "@/lib/services/property-knowledge";

export const taskSchema = z.object({
  title: z.string().min(2, "Task name is required"),
  description: z.string().optional(),
  clientId: z.string().optional().nullable(),
  propertyName: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  assignedUserId: z.string().optional().nullable(),
  // Set on a recurring template to auto-assign each day's generated instance
  // to whoever's actually scheduled WORKING that shift (see
  // generateRecurringTaskInstances) instead of a fixed assignedUserId.
  shiftTypeId: z.string().optional().nullable(),
  date: z.string(), // ISO date
  startTime: z.string().optional().nullable(),
  dueTime: z.string().optional().nullable(),
  priority: z.enum(["NORMAL", "IMPORTANT", "URGENT"]),
  status: z.enum(["UPCOMING", "IN_PROGRESS", "COMPLETED", "OVERDUE", "BLOCKED"]),
  blockedReason: z.string().optional().nullable(),
  notes: z.string().optional(),
  repeatMode: z.enum(["NONE", "DAILY", "WEEKLY", "CUSTOM", "MONTHLY", "YEARLY"]).default("NONE"),
  repeatDays: z.array(z.number().min(0).max(6)).default([]),
  // Only meaningful for MONTHLY — null falls back to the day-of-month of
  // `date` (see generateRecurringTaskInstances).
  repeatDayOfMonth: z.number().min(1).max(31).optional().nullable(),
})
  // A Weekly/Custom series with no days selected would be saved as a hidden
  // template that never fires — reject it instead of silently creating it.
  .refine((d) => !(d.repeatMode === "WEEKLY" || d.repeatMode === "CUSTOM") || d.repeatDays.length > 0, {
    message: "Pick at least one day for a weekly repeat",
    path: ["repeatDays"],
  });

// The lightweight status/priority/reassignment PATCH (Kanban drag, "Complete"
// button, the detail dialog's status picker). Previously the route copied
// body.status straight into Prisma, so an unknown value surfaced as a 500.
export const taskQuickUpdateSchema = z.object({
  status: z.enum(["UPCOMING", "IN_PROGRESS", "COMPLETED", "OVERDUE", "BLOCKED"]).optional(),
  blockedReason: z.string().max(500).optional().nullable(),
  assignedUserId: z.string().optional().nullable(),
  priority: z.enum(["NORMAL", "IMPORTANT", "URGENT"]).optional(),
});

// Editing an existing task — every field optional since a PATCH only ever
// sends what actually changed. `applyToSeries: true` additionally pushes the
// content fields (not date/status/assignedUserId — see the PATCH route) onto
// the recurring template, so future generated days pick up the fix too.
export const taskEditSchema = z.object({
  title: z.string().min(2, "Task name is required").optional(),
  clientId: z.string().optional().nullable(),
  propertyName: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  assignedUserId: z.string().optional().nullable(),
  date: z.string().optional(), // ISO date
  startTime: z.string().optional().nullable(),
  dueTime: z.string().optional().nullable(),
  priority: z.enum(["NORMAL", "IMPORTANT", "URGENT"]).optional(),
  notes: z.string().optional().nullable(),
  applyToSeries: z.boolean().optional(),
});

export const NOTICE_COLORS = ["YELLOW", "PINK", "BLUE", "PURPLE", "GREEN", "ORANGE"] as const;

export const noticeChecklistItemSchema = z.object({
  id: z.string(),
  text: z.string().min(1).max(200),
  checked: z.boolean(),
});

// A note is either plain text (non-empty content, no checklist) or a
// checklist (at least one item; content is then just an optional caption
// shown above the list) — never both empty.
export const noticeSchema = z
  .object({
    content: z.string().max(500, "Keep it under 500 characters").default(""),
    color: z.enum(NOTICE_COLORS).default("YELLOW"),
    checklist: z.array(noticeChecklistItemSchema).max(30, "Keep it under 30 items").optional(),
  })
  .refine((data) => data.content.trim().length > 0 || (data.checklist && data.checklist.length > 0), {
    message: "Write something first",
  });

// Every field is independently optional — PATCH only ever sends the one
// thing that changed (pin, archive, or a checklist item toggled), each
// gated by its own permission check in app/api/notices/[id]/route.ts.
export const noticeUpdateSchema = z
  .object({
    pinned: z.boolean().optional(),
    archived: z.boolean().optional(),
    checklist: z.array(noticeChecklistItemSchema).max(30).optional(),
  })
  .refine((data) => data.pinned !== undefined || data.archived !== undefined || data.checklist !== undefined, {
    message: "No changes provided",
  });

// ---- Attendance (docs/attendance-rules.md) ----

const isoInstant = z.string().datetime({ offset: true });
const dayKeyField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date");

// Employee's claim for a missed punch.
export const attendanceClaimSchema = z.object({
  date: dayKeyField,
  claimedCheckIn: isoInstant.optional().nullable(),
  claimedCheckOut: isoInstant.optional().nullable(),
  reason: z.string().trim().min(5, "Explain what happened (at least a few words)").max(500),
});

// Lead/admin decision. APPROVE needs both times — enforced in reviewRecord
// too, with a clearer message.
export const attendanceReviewSchema = z
  .object({
    recordId: z.string().optional(),
    userId: z.string().optional(),
    date: dayKeyField.optional(),
    action: z.enum(["APPROVE", "REJECT", "APPROVE_CHECK_IN"]),
    checkIn: isoInstant.optional().nullable(),
    checkOut: isoInstant.optional().nullable(),
    tasksConfirmed: z.boolean().optional(),
    note: z.string().max(500).optional().nullable(),
  })
  .refine((d) => !!d.recordId || (!!d.userId && !!d.date), { message: "Which shift is this for?" });

export const overtimeCreateSchema = z.object({
  userId: z.string().optional().nullable(),
  date: dayKeyField,
  minutes: z.number().int(),
  reason: z.string().trim().max(500),
  askedById: z.string().optional().nullable(),
  publicHoliday: z.boolean().optional(),
  approveNow: z.boolean().optional(),
});

export const overtimeReviewSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  approvedMinutes: z.number().int().optional().nullable(),
  note: z.string().max(500).optional().nullable(),
});

export const clientSchema = z.object({
  name: z.string().min(1),
  status: z.enum(["STABLE", "ATTENTION", "URGENT", "WAITING"]),
  guestCommunicationPlatform: z.string().optional().nullable(),
  operationPlatform: z.string().optional().nullable(),
  clientCommunicationPlatform: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// Every provider Charlie HQ's integration registry knows about today. None
// has a real connector — see lib/services/integrations.ts.
export const INTEGRATION_PROVIDERS = [
  "GUESTY",
  "AIRBNB",
  "CLICKUP",
  "WHATSAPP",
  "ENSO",
  "HOSTBUDDY",
  "GOOGLE_DRIVE",
  "GOOGLE_SHEETS",
  "NOTION",
  "OTHER",
] as const;

// Client-safe (no Prisma import) so both server routes and the client-side
// wizard/integrations panel can use the same display labels without the
// panel having to import lib/services/integrations.ts (which is
// server-only). lib/services/integrations.ts re-exports this.
export const INTEGRATION_LABELS: Record<(typeof INTEGRATION_PROVIDERS)[number], string> = {
  GUESTY: "Guesty",
  AIRBNB: "Airbnb (official API)",
  CLICKUP: "ClickUp",
  WHATSAPP: "WhatsApp",
  ENSO: "Enso",
  HOSTBUDDY: "HostBuddy",
  GOOGLE_DRIVE: "Google Drive",
  GOOGLE_SHEETS: "Google Sheets",
  NOTION: "Notion",
  OTHER: "Other",
};

// The Add Client wizard's Step 3 (Integrations) only ever *enables a
// capability* — it creates NOT_CONNECTED rows, never CONNECTED ones. See
// app/api/clients/route.ts.
export const clientCreateSchema = clientSchema.extend({
  integrations: z.array(z.enum(INTEGRATION_PROVIDERS)).optional().default([]),
  // Wizard's "Google Knowledge Base" step — defaults on, matching the spec's
  // "Default: Enabled." A client can always get a spreadsheet later from
  // the workspace panel, so this only controls whether it happens
  // automatically at creation time.
  createGoogleSheet: z.boolean().optional().default(true),
  // Defaults to the team picked in the switcher.
  squadId: z.string().min(1).nullable().optional(),
});

// Edit Client reuses the base fields plus active (deactivate/reactivate).
// workspaceTemplate is deliberately NOT editable here — it's a rare,
// legitimately-special-workflow flag (see ClientWorkspaceTemplate), not a
// normal per-client setting an admin should casually flip from this form.
export const clientUpdateSchema = clientSchema.partial().extend({
  active: z.boolean().optional(),
  // Moving a client to another team moves its listings, reviews and tasks with it.
  squadId: z.string().min(1).optional(),
});

// Client creation only ever enables a capability (creates a NOT_CONNECTED or
// NEEDS_AUTHORIZATION row) — it never claims CONNECTED, since that would be
// asserting a real external connection nothing has verified. Only an
// explicit later edit (a human confirming they set it up) can mark CONNECTED.
export const clientIntegrationCreateSchema = z.object({
  provider: z.enum(INTEGRATION_PROVIDERS),
  status: z.enum(["NOT_CONNECTED", "NEEDS_AUTHORIZATION"]).default("NOT_CONNECTED"),
});

export const clientIntegrationUpdateSchema = z.object({
  status: z.enum(["NOT_CONNECTED", "NEEDS_AUTHORIZATION", "CONNECTED", "ERROR"]),
  note: z.string().max(500).optional().nullable(),
});

export const CLIENT_FILE_CATEGORIES = ["SOP", "PROPERTIES", "INVOICES", "KNOWLEDGE", "OTHER"] as const;
// UPLOAD is a recognized source in the schema for when binary storage is
// wired up, but the create form only accepts link-based sources today — see
// the ClientFileSource comment in prisma/schema.prisma.
export const CLIENT_FILE_LINK_SOURCES = ["GOOGLE_DRIVE", "URL", "GENERATED", "EXTERNAL"] as const;

export const clientFileSchema = z.object({
  clientId: z.string().min(1, "Client is required"),
  name: z.string().min(1, "File name is required"),
  category: z.enum(CLIENT_FILE_CATEGORIES).default("OTHER"),
  source: z.enum(CLIENT_FILE_LINK_SOURCES),
  url: z.string().url("Enter a valid URL"),
});

export const checklistItemSchema = z.object({
  label: z.string().min(1, "Checklist item text is required"),
});

export const checklistItemUpdateSchema = z.object({
  label: z.string().min(1, "Checklist item text is required").optional(),
  active: z.boolean().optional(),
  order: z.number().int().optional(),
});

export const shiftTypeSchema = z.object({
  name: z.string().min(1, "Shift name is required"),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:mm"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:mm"),
  colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #22d3ee"),
  active: z.boolean().default(true),
});

export const shiftAssignmentCreateSchema = z.object({
  userId: z.string(),
  shiftTypeId: z.string(),
  weekStart: z.string(), // ISO date (Monday of the target week)
});

export const shiftAssignmentUpdateSchema = z.object({
  shiftTypeId: z.string().optional().nullable(),
  status: z.enum(["WORKING", "WEEKEND", "PAID_LEAVE", "UNPAID_LEAVE", "SICK_LEAVE"]),
  customStart: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  customEnd: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  note: z.string().optional().nullable(),
});

export const createUserSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Enter a valid email"),
  role: z.enum(["ADMIN", "HR", "TEAM_LEAD", "EMPLOYEE"]),
  squadId: z.string().min(1).nullable().optional(),
  defaultShiftTypeId: z.string().optional().nullable(),
});

export const updateUserSchema = z.object({
  role: z.enum(["ADMIN", "HR", "TEAM_LEAD", "EMPLOYEE"]).optional(),
  squadId: z.string().min(1).nullable().optional(),
  active: z.boolean().optional(),
  defaultShiftTypeId: z.string().optional().nullable(),
  // A Discord snowflake (numeric string), not a username — see the schema
  // comment on User.discordUserId for why. Caller sends null (not "") to clear it.
  discordUserId: z.string().regex(/^\d+$/, "Discord user ID is numeric, e.g. 123456789012345678").optional().nullable(),
  // A Slack member ID, e.g. "U0123456789" — not a username/handle. Caller
  // sends null (not "") to clear it.
  slackUserId: z.string().regex(/^U[A-Z0-9]+$/i, "Slack user ID looks like U0123456789").optional().nullable(),
});

const optionalText = z.string().optional().nullable();
const optionalDate = z.string().optional().nullable();
const optionalMoney = z.union([z.string(), z.number()]).optional().nullable();

export const propertySchema = z.object({
  clientId: z.string(),
  internalCode: z.string().min(1, "Property code is required"),
  address: z.string().min(1, "Address is required"),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  zip: optionalText,
  photosLink: optionalText,
  redfinLink: optionalText,
  zillowLink: optionalText,
  googleMapsLink: optionalText,
  driveTimesNote: optionalText,
  generalNotes: optionalText,
  active: z.boolean().optional(),
});

export const unitSchema = z.object({
  propertyId: z.string(),
  parentUnitId: optionalText,
  internalName: z.string().min(1, "Unit name is required"),
  listingLevel: z.enum(["WHOLE_PROPERTY", "WHOLE_HOUSE", "PRIVATE_ROOM", "DETACHED_UNIT"]),
  bedBathConfig: optionalText,
  bedType: optionalText,
  hasSofaBed: z.boolean().default(false),
  thermostatLocation: optionalText,
  parkingInfo: optionalText,
  petPolicy: optionalText,
  hasTV: z.boolean().optional().nullable(),
  airbnbLink: optionalText,
  vrboLink: optionalText,
  amenitiesDocLink: optionalText,
  active: z.boolean().optional(),
});

export const tenancySchema = z.object({
  unitId: z.string(),
  status: z.enum(["CURRENT", "UPCOMING", "VACANT", "AIRBNB_TRANSITION"]),
  tenantName: optionalText,
  tenantContact: optionalText,
  moveInDate: optionalDate,
  moveOutDate: optionalDate,
  nextTenantName: optionalText,
  nextTenantMoveIn: optionalDate,
  nextTenantMoveOut: optionalDate,
  leaseSource: optionalText,
  rentAmount: optionalMoney,
  securityDeposit: optionalMoney,
  cleaningFee: optionalMoney,
  petFee: optionalMoney,
  utilitiesNote: optionalText,
  parkingNote: optionalText,
  amountDue: optionalMoney,
  notes: optionalText,
});

export const leadSchema = z.object({
  clientId: z.string(),
  interestedUnitId: optionalText,
  name: z.string().min(1, "Lead name is required"),
  channel: z.string().min(1, "Channel is required"),
  status: z.string().min(1, "Status is required"),
  contactedDate: optionalDate,
  notes: optionalText,
});

const airbnbUrl = z.string().url("Enter a valid Airbnb URL").refine(isAirbnbUrl, "Use an Airbnb URL");

export const propertyKnowledgeItemSchema = z.object({
  clientId: z.string().min(1, "Client is required"),
  internalName: z.string().min(1, "Property name is required"),
  airbnbUrl,
  // EXTRACTING/FAILED are process-only states set by the extraction route —
  // a manual create/edit request may never claim them directly.
  status: z.enum(MANUAL_KNOWLEDGE_STATUSES).optional(),
  listingName: optionalText,
  description: optionalText,
  amenities: z.array(z.string()).optional(),
  propertyType: optionalText,
  location: optionalText,
  guestCapacity: z.coerce.number().int().min(0).optional().nullable(),
  bedrooms: z.coerce.number().min(0).optional().nullable(),
  bathrooms: z.coerce.number().min(0).optional().nullable(),
  beds: z.coerce.number().min(0).optional().nullable(),
  rules: optionalText,
  wifiName: optionalText,
  wifiPassword: optionalText,
  doorCode: optionalText,
  parkingInfo: optionalText,
  checkInInfo: optionalText,
  checkoutInfo: optionalText,
  internalNotes: optionalText,
});

export const propertyKnowledgeBulkImportSchema = z.object({
  clientId: z.string().min(1, "Client is required"),
  csvText: z.string().min(1, "Paste at least one property row"),
});

// ---- Multi-team: sign-up, invites, team settings ----

const passwordField = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(200, "That password is too long");

const timezoneField = z.string().refine(
  (tz) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  },
  { message: "Pick a valid timezone" }
);

export const signupSchema = z.object({
  teamName: z.string().trim().min(2, "Company name is required").max(60, "Keep the company name under 60 characters"),
  name: z.string().trim().min(1, "Your name is required").max(80),
  email: z.string().trim().email("Enter a valid email"),
  password: passwordField,
  timezone: timezoneField,
});

export const inviteCreateSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  role: z.enum(["ADMIN", "HR", "TEAM_LEAD", "EMPLOYEE"]).default("EMPLOYEE"),
  squadId: z.string().min(1).nullable().optional(),
});

export const addPeopleSchema = z.object({
  people: z.array(z.object({ name: z.string().trim().min(1).max(80), email: z.string().trim().email() })).min(1, "Add at least one person").max(50, "Up to 50 people at a time"),
  role: z.enum(["ADMIN", "HR", "TEAM_LEAD", "EMPLOYEE"]),
  squadId: z.string().min(1).nullable(),
  defaultShiftTypeId: z.string().min(1).nullable().optional(),
  // invite: they set their own password from a link (recommended).
  // password: a temporary password the adder hands over.
  method: z.enum(["invite", "password"]),
});

export const inviteAcceptSchema = z.object({
  token: z.string().min(10),
  name: z.string().trim().min(1, "Your name is required").max(80),
  password: passwordField,
});

export const teamSettingsSchema = z.object({
  name: z.string().trim().min(2, "Team name is required").max(60).optional(),
  timezone: timezoneField.optional(),
  // "" clears it. Only Discord's own incoming-webhook URLs are accepted, so a
  // saved value can't be used to make the server POST to arbitrary hosts.
  autoCheckoutHours: z.number().int().min(4, "At least 4 hours").max(24, "At most 24 hours").optional(),
  discordWebhookUrl: z
    .string()
    .trim()
    .refine((v) => v === "" || /^https:\/\/(?:ptb\.|canary\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(v), {
      message: "Paste a Discord webhook URL (https://discord.com/api/webhooks/…)",
    })
    .optional(),
});

// Teams inside the company. "Team Bravo" and "Bravo" are the same name.
export const squadNameSchema = z.string().trim().min(1, "Give the team a name").max(40).transform((n) => n.replace(/^team\s+/i, "").trim()).pipe(z.string().min(1, "Give the team a name"));

// Client portal.
export const portalInviteSchema = z.object({ name: z.string().trim().min(1, "Their name is required").max(80), email: z.string().trim().email("Enter a valid email") });
export const clientRequestSchema = z.object({
  kind: z.enum(["KNOWLEDGE_BASE", "LISTING", "REVIEW", "OTHER"]),
  message: z.string().trim().min(3, "Tell the team what you need").max(2000),
  propertyId: z.string().min(1).nullable().optional(),
});
