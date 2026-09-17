import { z } from "zod";
import { isAirbnbUrl, MANUAL_KNOWLEDGE_STATUSES } from "@/lib/services/property-knowledge";

export const taskSchema = z.object({
  title: z.string().min(2, "Task name is required"),
  description: z.string().optional(),
  clientId: z.string().optional().nullable(),
  propertyName: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  assignedUserId: z.string().optional().nullable(),
  date: z.string(), // ISO date
  startTime: z.string().optional(),
  dueTime: z.string().optional(),
  priority: z.enum(["NORMAL", "IMPORTANT", "URGENT"]),
  status: z.enum(["UPCOMING", "IN_PROGRESS", "COMPLETED", "OVERDUE", "BLOCKED"]),
  notes: z.string().optional(),
  repeatMode: z.enum(["NONE", "DAILY", "WEEKLY", "CUSTOM"]).default("NONE"),
  repeatDays: z.array(z.number().min(0).max(6)).default([]),
});

export const attendanceEditSchema = z.object({
  recordId: z.string(),
  actualCheckIn: z.string().datetime().optional().nullable(),
  actualCheckOut: z.string().datetime().optional().nullable(),
  reason: z.string().min(3, "Please provide a reason for this edit"),
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
});

// Edit Client reuses the base fields plus active (deactivate/reactivate).
// workspaceTemplate is deliberately NOT editable here — it's a rare,
// legitimately-special-workflow flag (see ClientWorkspaceTemplate), not a
// normal per-client setting an admin should casually flip from this form.
export const clientUpdateSchema = clientSchema.partial().extend({
  active: z.boolean().optional(),
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
  status: z.enum(["WORKING", "WEEKEND", "LEAVE"]),
  customStart: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  customEnd: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  note: z.string().optional().nullable(),
});

export const createUserSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Enter a valid email"),
  role: z.enum(["ADMIN", "TEAM_LEAD", "EMPLOYEE"]),
  defaultShiftTypeId: z.string().optional().nullable(),
});

export const updateUserSchema = z.object({
  role: z.enum(["ADMIN", "TEAM_LEAD", "EMPLOYEE"]).optional(),
  active: z.boolean().optional(),
  defaultShiftTypeId: z.string().optional().nullable(),
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
