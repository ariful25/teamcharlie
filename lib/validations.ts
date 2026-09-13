import { z } from "zod";

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

const airbnbUrl = z.string().url("Enter a valid Airbnb URL").refine((value) => {
  try {
    const host = new URL(value).hostname.replace(/^www\./, "");
    return host === "airbnb.com" || host.endsWith(".airbnb.com");
  } catch {
    return false;
  }
}, "Use an Airbnb URL");

export const propertyKnowledgeItemSchema = z.object({
  clientId: z.string().min(1, "Client is required"),
  internalName: z.string().min(1, "Property name is required"),
  airbnbUrl,
  status: z.enum(["PENDING", "EXTRACTING", "NEEDS_REVIEW", "READY", "EXPORTED", "FAILED"]).optional(),
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
