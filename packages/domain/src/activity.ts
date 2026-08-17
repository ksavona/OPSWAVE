import { z } from "zod";

export const ACTIVITY_KINDS = ["message", "log_note"] as const;
export const ACTIVITY_VISIBILITIES = [
  "owner_admin",
  "authorised_participants",
  "selected_participants",
  "actor_and_owner",
] as const;

export const activityCreateSchema = z.object({
  body: z.string().trim().min(1).max(20_000),
  kind: z.enum(ACTIVITY_KINDS),
  mentionedUserIds: z.array(z.uuid()).max(100).default([]),
  notifyUserIds: z.array(z.uuid()).max(100).default([]),
  subjectId: z.uuid(),
  subjectType: z.enum(["project", "task"]),
});

export const activityQuerySchema = z.object({
  category: z.string().trim().max(64).optional(),
  cursor: z.string().max(200).optional(),
  dateFrom: z.iso.date().optional(),
  dateTo: z.iso.date().optional(),
  query: z.string().trim().max(200).optional(),
  userId: z.uuid().optional(),
  userGenerated: z.boolean().optional(),
});

export type ActivityCreateInput = z.infer<typeof activityCreateSchema>;
