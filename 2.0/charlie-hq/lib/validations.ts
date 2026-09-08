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
