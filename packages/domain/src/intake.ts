import { z } from "zod";

export const INTAKE_SCHEMA_VERSION = "2026-08-06";

export const intakeSubmissionSchema = z.object({
  content: z.string().trim().min(1).max(100_000),
  sourceType: z.enum(["instruction", "meeting_note", "other_text", "transcript"]),
});

export const draftTaskSchema = z.object({
  businessValueRationale: z.string().trim().max(10_000).nullable(),
  businessValueScore: z.number().int().min(1).max(100).nullable(),
  confidence: z.number().min(0).max(1),
  dueDate: z.iso.date().nullable(),
  sourceSpan: z.string().trim().max(2_000).nullable(),
  title: z.string().trim().min(1).max(300),
});

export const intakeDraftSchema = z.object({
  questions: z.array(z.string().trim().min(1).max(1_000)).max(20),
  summary: z.string().trim().max(10_000),
  tasks: z.array(draftTaskSchema).max(100),
});

export type IntakeDraft = z.infer<typeof intakeDraftSchema>;
export type IntakeSubmission = z.infer<typeof intakeSubmissionSchema>;
