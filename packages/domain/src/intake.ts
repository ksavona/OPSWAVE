import { z } from "zod";

import { WORKFLOW_LANES } from "./work.ts";

export const INTAKE_SCHEMA_VERSION = "2026-08-17.1";

export const intakeSubmissionSchema = z.object({
  createNewProjects: z.boolean().optional(),
  content: z.string().trim().min(1).max(100_000),
  selectedProjectIds: z.array(z.uuid()).max(25).optional(),
  sourceType: z.enum(["instruction", "meeting_note", "other_text", "transcript"]),
});

export const draftBlockerSchema = z.object({
  id: z.string().trim().min(1).max(100),
  type: z.enum(["existing_project", "existing_task", "proposed_project", "proposed_task"]),
});

const draftChecklistItemSchema = z
  .union([
    z.string().trim().min(1).max(500),
    z.object({
      completed: z.boolean().default(false),
      description: z.string().trim().max(5_000).nullable().default(null),
      label: z.string().trim().min(1).max(500),
      predictedHours: z.number().min(0).max(10_000).nullable().default(null),
    }),
  ])
  .transform((item) =>
    typeof item === "string"
      ? { completed: false, description: null, label: item, predictedHours: null }
      : item,
  );

export const draftTaskSchema = z.object({
  allocatedHours: z.number().min(0).max(10_000).nullable().default(null),
  assigneeName: z.string().trim().min(1).max(200).nullable().default(null),
  blockers: z.array(draftBlockerSchema).max(100).default([]),
  businessValueRationale: z.string().trim().max(10_000).nullable(),
  businessValueScore: z.number().int().min(1).max(100).nullable(),
  checklist: z.array(draftChecklistItemSchema).max(100).default([]),
  clientName: z.string().trim().max(200).nullable().default(null),
  clientRef: z.string().trim().min(1).max(100).nullable().default(null),
  confidence: z.number().min(0).max(1),
  definitionOfDone: z.string().trim().max(10_000).nullable().default(null),
  dueDate: z.iso.date().nullable(),
  endTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/u)
    .nullable()
    .default(null),
  ownerTask: z.boolean().default(true),
  origin: z.string().trim().max(10_000).nullable().default(null),
  planningEligible: z.boolean().default(true),
  planningRationale: z.string().trim().max(10_000).default("Pending initial planning run."),
  notes: z.unknown().default({ content: [], type: "doc" }),
  priorityLevel: z.number().int().min(1).max(5).nullable().default(null),
  projectId: z.uuid().nullable().default(null),
  proposedProjectRef: z.string().trim().min(1).max(100).nullable().default(null),
  size: z.enum(["small", "medium", "large", "mega"]).nullable().default(null),
  sourceSpan: z.string().trim().max(2_000).nullable(),
  scheduleLocked: z.boolean().default(false),
  status: z
    .enum(["not_started", "on_track", "in_progress", "on_hold", "at_risk"])
    .default("not_started"),
  startDate: z.iso.date().nullable().default(null),
  startTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/u)
    .nullable()
    .default(null),
  title: z.string().trim().min(1).max(300),
  valueAdd: z.string().trim().max(10_000).nullable().default(null),
  workDescription: z.string().trim().max(10_000).nullable().default(null),
  workflowLane: z.enum(WORKFLOW_LANES).default("inbox"),
});

export const draftProjectSchema = z.object({
  clientRef: z.string().trim().min(1).max(100),
  description: z.string().trim().max(10_000),
  name: z.string().trim().min(1).max(200),
  priorityLevel: z.number().int().min(1).max(5),
});

export const intakeDraftSchema = z.object({
  includedProjectIds: z.array(z.uuid()).max(25).optional(),
  participants: z.array(z.string().trim().min(1).max(200)).max(100).default([]),
  projects: z.array(draftProjectSchema).max(25).default([]),
  questions: z.array(z.string().trim().min(1).max(1_000)).max(20),
  summary: z.string().trim().max(10_000),
  tasks: z.array(draftTaskSchema).max(100),
});

export type IntakeDraft = z.infer<typeof intakeDraftSchema>;
export type IntakeSubmission = z.infer<typeof intakeSubmissionSchema>;
