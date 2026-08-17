import { z } from "zod";

export const WORKSPACE_ROLES = ["owner", "admin", "delegate"] as const;
export const ACCESS_ROLES = ["contributor", "project_collaborator", "reviewer"] as const;
export const ACCESS_GRANT_STATUSES = [
  "invite_pending",
  "active",
  "expired",
  "declined",
  "revoked",
] as const;
export const ACCESS_SUBJECT_TYPES = ["project", "task"] as const;
export const MEMBERSHIP_STATUSES = ["invited", "active", "deactivated", "archived"] as const;
export const DELEGATE_STAGE_KINDS = [
  "assigned",
  "in_progress",
  "waiting_for_input",
  "ready_for_review",
  "complete",
  "custom",
] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];
export type AccessRole = (typeof ACCESS_ROLES)[number];
export type AccessGrantStatus = (typeof ACCESS_GRANT_STATUSES)[number];
export type AccessSubjectType = (typeof ACCESS_SUBJECT_TYPES)[number];
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];
export type DelegateStageKind = (typeof DELEGATE_STAGE_KINDS)[number];

export interface Principal {
  readonly authorizationVersion: number;
  readonly email: string | null;
  readonly fullName: string | null;
  readonly membershipAuthorizationVersion: number;
  readonly membershipId: string;
  readonly membershipStatus: MembershipStatus;
  readonly ownerId: string | null;
  readonly role: WorkspaceRole;
  readonly sessionId: string;
  readonly userId: string;
  readonly userStatus: MembershipStatus;
  readonly username: string | null;
  readonly workspaceId: string;
}

export type Capability =
  | "access.manage"
  | "activity.read"
  | "activity.write"
  | "ai.use"
  | "attachments.read"
  | "attachments.write"
  | "compliance.review"
  | "delegate.stage.update"
  | "intake.manage"
  | "notifications.read"
  | "planning.manage"
  | "project.create"
  | "project.delete"
  | "project.read"
  | "project.update"
  | "reports.read"
  | "settings.manage"
  | "task.create"
  | "task.delete"
  | "task.read"
  | "task.update"
  | "timesheet.read"
  | "timesheet.write"
  | "users.manage";

const OWNER_ADMIN_CAPABILITIES = new Set<Capability>([
  "access.manage",
  "activity.read",
  "activity.write",
  "ai.use",
  "attachments.read",
  "attachments.write",
  "compliance.review",
  "delegate.stage.update",
  "intake.manage",
  "notifications.read",
  "planning.manage",
  "project.create",
  "project.delete",
  "project.read",
  "project.update",
  "reports.read",
  "settings.manage",
  "task.create",
  "task.delete",
  "task.read",
  "task.update",
  "timesheet.read",
  "timesheet.write",
  "users.manage",
]);

const DELEGATE_BASE_CAPABILITIES = new Set<Capability>([
  "activity.read",
  "activity.write",
  "attachments.read",
  "delegate.stage.update",
  "notifications.read",
  "task.read",
  "timesheet.read",
  "timesheet.write",
]);

export const hasWorkspaceCapability = (principal: Principal, capability: Capability): boolean => {
  if (
    principal.userStatus !== "active" ||
    principal.membershipStatus !== "active" ||
    principal.authorizationVersion < 1 ||
    principal.membershipAuthorizationVersion < 1
  ) {
    return false;
  }
  return principal.role === "owner" || principal.role === "admin"
    ? OWNER_ADMIN_CAPABILITIES.has(capability)
    : DELEGATE_BASE_CAPABILITIES.has(capability);
};

export const normalizeEmail = (value: string): string =>
  value.normalize("NFKC").trim().toLocaleLowerCase("en-US");

const emailSchema = z
  .email()
  .max(320)
  .transform((value) => normalizeEmail(value));

export const delegationCreateSchema = z
  .object({
    accessRole: z.enum(ACCESS_ROLES),
    anonymise: z.boolean().default(false),
    delegateEmail: emailSchema,
    delegationNote: z.string().trim().max(4_000).nullable().default(null),
    expiresAt: z.iso.datetime().nullable().default(null),
    subjectId: z.uuid(),
    subjectType: z.enum(ACCESS_SUBJECT_TYPES),
  })
  .superRefine((value, context) => {
    if (value.accessRole === "project_collaborator" && value.subjectType !== "project") {
      context.addIssue({
        code: "custom",
        message: "Project collaborators require project-level access.",
        path: ["accessRole"],
      });
    }
    if (value.expiresAt !== null && new Date(value.expiresAt).getTime() <= Date.now()) {
      context.addIssue({
        code: "custom",
        message: "Access expiry must be in the future.",
        path: ["expiresAt"],
      });
    }
  });

export const delegationUpdateSchema = z
  .object({
    accessRole: z.enum(ACCESS_ROLES).optional(),
    delegateEmail: emailSchema.optional(),
    delegationNote: z.string().trim().max(4_000).nullable().optional(),
    expiresAt: z.iso.datetime().nullable().optional(),
    version: z.number().int().positive(),
  })
  .refine((value) => Object.keys(value).some((key) => key !== "version"), {
    message: "At least one delegation field must change.",
  })
  .refine(
    (value) =>
      value.expiresAt === undefined ||
      value.expiresAt === null ||
      new Date(value.expiresAt).getTime() > Date.now(),
    {
      message: "Access expiry must be in the future.",
      path: ["expiresAt"],
    },
  );

export const invitationAcceptSchema = z.object({
  fullName: z.string().trim().min(1).max(200).optional(),
  password: z.string().optional(),
  passwordConfirmation: z.string().optional(),
  token: z.string().min(32).max(512),
});

export const delegateStageCreateSchema = z.object({
  color: z.string().trim().max(32).default("#5ee5b5"),
  name: z.string().trim().min(1).max(100),
});

export const delegateStateUpdateSchema = z.object({
  latestUpdate: z.string().trim().max(2_000).nullable().default(null),
  stageId: z.uuid(),
  version: z.number().int().positive(),
});

export const delegateProjectTaskCreateSchema = z.object({
  allocatedHours: z.number().min(0).max(10_000).nullable().default(null),
  definitionOfDone: z.string().trim().max(20_000).nullable().default(null),
  description: z.string().trim().max(20_000).nullable().default(null),
  title: z.string().trim().min(1).max(300),
});

export const delegateSubtaskCreateSchema = z.object({
  description: z.string().trim().max(5_000).nullable().default(null),
  label: z.string().trim().min(1).max(500),
  predictedHours: z.number().min(0).max(10_000).nullable().default(null),
});

export const delegateSubtaskUpdateSchema = delegateSubtaskCreateSchema.extend({
  completed: z.boolean(),
  version: z.number().int().positive(),
});

export const taskDelegateSharingSchema = z
  .object({
    selectedUserIds: z.array(z.uuid()).max(100).default([]),
    visibility: z.enum(["internal", "project_delegates", "selected_delegates"]),
  })
  .superRefine((value, context) => {
    if (value.visibility === "selected_delegates" && value.selectedUserIds.length === 0) {
      context.addIssue({
        code: "custom",
        message: "Select at least one project delegate.",
        path: ["selectedUserIds"],
      });
    }
  });

export const delegatePresentationSchema = z.object({
  neutralClientLabel: z.string().trim().max(200).nullable().default(null),
  neutralProjectLabel: z.string().trim().max(200).nullable().default(null),
  safeDefinitionOfDone: z.string().trim().max(20_000).nullable().default(null),
  safeDescription: z.string().trim().max(20_000).nullable().default(null),
  safeNotes: z.unknown().default({ content: [], type: "doc" }),
  safeTitle: z.string().trim().min(1).max(300),
  safeWorkDescription: z.string().trim().max(20_000).nullable().default(null),
  status: z.enum(["approved", "blocked", "draft"]),
  subjectId: z.uuid(),
  subjectType: z.enum(ACCESS_SUBJECT_TYPES),
  version: z.number().int().positive().nullable().default(null),
});

export const collaborationFlagsSchema = z.object({
  complianceMonitorEnabled: z.boolean(),
  delegateUploadsEnabled: z.boolean(),
  invitationEmailEnabled: z.boolean(),
  multiUserEnabled: z.boolean(),
});

export const ATTACHMENT_VISIBILITIES = [
  "internal_only",
  "shared_all_delegates",
  "shared_selected_delegates",
  "redacted_delegate_copy",
] as const;

export const attachmentSharingSchema = z
  .object({
    approvalStatus: z.enum(["approved", "draft", "rejected"]),
    delegateSafeName: z.string().trim().max(500).nullable().default(null),
    selectedUserIds: z.array(z.uuid()).max(100).default([]),
    visibility: z.enum(ATTACHMENT_VISIBILITIES),
  })
  .superRefine((value, context) => {
    if (value.visibility === "shared_selected_delegates" && value.selectedUserIds.length === 0) {
      context.addIssue({
        code: "custom",
        message: "Select at least one delegate.",
        path: ["selectedUserIds"],
      });
    }
  });

export const isGrantActive = (
  grant: { readonly expiresAt: Date | null; readonly status: AccessGrantStatus },
  now = new Date(),
): boolean =>
  grant.status === "active" &&
  (grant.expiresAt === null || grant.expiresAt.getTime() > now.getTime());

export type DelegationCreateInput = z.infer<typeof delegationCreateSchema>;
export type DelegationUpdateInput = z.infer<typeof delegationUpdateSchema>;
export type DelegateStateUpdateInput = z.infer<typeof delegateStateUpdateSchema>;
