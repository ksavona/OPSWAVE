import { SafeApplicationError, entityIdSchema, safeErrorResponse } from "@opsweave/domain";

import { AuthService } from "./auth-service";
import { ActivityService } from "./activity-service";
import { DelegateService } from "./delegate-service";
import { DelegationService } from "./delegation-service";
import { InvitationService } from "./invitation-service";
import { NotificationService } from "./notification-service";
import { TimesheetService } from "./timesheet-service";
import { ComplianceService } from "./compliance-service";
import { createRateLimitGate } from "./rate-limits";
import {
  assertSameOrigin,
  createSessionCookie,
  getNetworkSignal,
  readCookie,
} from "./request-security";
import { getCollaborationStore, getStore, logger } from "./runtime";
import { canonicalPublicOrigin } from "./public-origin";

const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  Response.json(body, { status, ...(headers === undefined ? {} : { headers }) });

const run = async (operation: () => Promise<Response>): Promise<Response> => {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return json({ error: "validation_error", message: "Review the submitted values." }, 400);
    }
    const safe = safeErrorResponse(error);
    if (safe.status === 500) logger.error({ err: error }, "collaboration request failed safely");
    return json(safe.body, safe.status);
  }
};

const body = async (request: Request): Promise<Record<string, unknown>> => {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 65_536) {
    throw new SafeApplicationError("validation_error", "The request body is too large.", 413);
  }
  const text = await request.text();
  if (text.length > 65_536) {
    throw new SafeApplicationError("validation_error", "The request body is too large.", 413);
  }
  try {
    const value: unknown = JSON.parse(text);
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new SafeApplicationError("validation_error", "The request body is invalid.", 400);
  }
};

const auth = () => new AuthService(getStore(), createRateLimitGate());
export const requirePrincipal = (request: Request) =>
  auth().authenticatePrincipalToken(readCookie(request));

export const delegationsHandler = (request: Request) =>
  run(async () => {
    const session = await requirePrincipal(request);
    const service = new DelegationService(getCollaborationStore());
    if (request.method === "GET") {
      const url = new URL(request.url);
      const subjectId = url.searchParams.get("subjectId");
      const subjectType = url.searchParams.get("subjectType");
      const subject: { id: string; type: "project" | "task" } | undefined =
        subjectId === null || (subjectType !== "project" && subjectType !== "task")
          ? undefined
          : { id: entityIdSchema.parse(subjectId), type: subjectType };
      return json({ grants: await service.list(session, subject) });
    }
    assertSameOrigin(request);
    await auth().consumeSensitiveAction(session.userId);
    return json(
      await service.create(session, await body(request), canonicalPublicOrigin(request)),
      201,
    );
  });

export const existingDelegationHandler = (request: Request) =>
  run(async () => {
    assertSameOrigin(request);
    const session = await requirePrincipal(request);
    await auth().consumeSensitiveAction(session.userId);
    return json(
      {
        grant: await new DelegationService(getCollaborationStore()).grantExisting(
          session,
          await body(request),
        ),
      },
      201,
    );
  });

export const delegationHandler = (request: Request, grantIdValue: string) =>
  run(async () => {
    const session = await requirePrincipal(request);
    const grantId = entityIdSchema.parse(grantIdValue);
    const service = new DelegationService(getCollaborationStore());
    assertSameOrigin(request);
    if (request.method === "DELETE") {
      await service.revoke(session, grantId);
      return json({ revoked: true });
    }
    const updated = await service.update(
      session,
      grantId,
      await body(request),
      canonicalPublicOrigin(request),
    );
    return json("replaced" in updated ? updated : { grant: updated });
  });

export const resendDelegationHandler = (request: Request, grantIdValue: string) =>
  run(async () => {
    assertSameOrigin(request);
    const session = await requirePrincipal(request);
    await auth().consumeSensitiveAction(session.userId);
    const result = await new DelegationService(getCollaborationStore()).resend(
      session,
      entityIdSchema.parse(grantIdValue),
      canonicalPublicOrigin(request),
    );
    return json(result);
  });

export const delegatePresentationHandler = (request: Request) =>
  run(async () => {
    const session = await requirePrincipal(request);
    const service = new DelegationService(getCollaborationStore());
    if (request.method === "GET") {
      const url = new URL(request.url);
      const subjectType = url.searchParams.get("subjectType");
      if (subjectType !== "project" && subjectType !== "task") {
        throw new SafeApplicationError("validation_error", "The subject type is invalid.", 400);
      }
      const subjectId = entityIdSchema.parse(url.searchParams.get("subjectId"));
      return json({ presentation: await service.getPresentation(session, subjectType, subjectId) });
    }
    assertSameOrigin(request);
    return json({ presentation: await service.savePresentation(session, await body(request)) });
  });

export const usersHandler = (request: Request) =>
  run(async () =>
    json({
      users: await new DelegationService(getCollaborationStore()).users(
        await requirePrincipal(request),
      ),
    }),
  );

export const delegationProgressHandler = (request: Request) =>
  run(async () => {
    const url = new URL(request.url);
    return json({
      progress: await new DelegationService(getCollaborationStore()).taskProgress(
        await requirePrincipal(request),
        entityIdSchema.parse(url.searchParams.get("taskId")),
      ),
    });
  });

export const taskAssignmentsHandler = (request: Request, taskIdValue: string) =>
  run(async () => {
    const session = await requirePrincipal(request);
    const taskId = entityIdSchema.parse(taskIdValue);
    const service = new DelegationService(getCollaborationStore());
    if (request.method === "GET") {
      return json({ assignees: await service.taskAssignments(session, taskId) });
    }
    assertSameOrigin(request);
    return json({
      assignees: await service.updateTaskAssignments(session, taskId, await body(request)),
    });
  });

export const taskDelegateSharingHandler = (request: Request, taskIdValue: string) =>
  run(async () => {
    const session = await requirePrincipal(request);
    const taskId = entityIdSchema.parse(taskIdValue);
    const service = new DelegationService(getCollaborationStore());
    if (request.method === "GET") {
      return json({ sharing: await service.taskSharing(session, taskId) });
    }
    assertSameOrigin(request);
    return json({ sharing: await service.updateTaskSharing(session, taskId, await body(request)) });
  });

export const subjectAnonymisationHandler = (request: Request) =>
  run(async () => {
    const session = await requirePrincipal(request);
    const url = new URL(request.url);
    const subjectType = url.searchParams.get("subjectType");
    if (subjectType !== "project" && subjectType !== "task") {
      throw new SafeApplicationError("validation_error", "The subject type is invalid.", 400);
    }
    const subjectId = entityIdSchema.parse(url.searchParams.get("subjectId"));
    const service = new DelegationService(getCollaborationStore());
    if (request.method === "GET") {
      return json({ anonymisation: await service.anonymisation(session, subjectType, subjectId) });
    }
    assertSameOrigin(request);
    return json({
      anonymisation: await service.updateAnonymisation(
        session,
        subjectType,
        subjectId,
        await body(request),
      ),
    });
  });

export const collaborationSettingsHandler = (request: Request) =>
  run(async () => {
    const session = await requirePrincipal(request);
    const service = new DelegationService(getCollaborationStore());
    if (request.method === "GET") return json({ flags: await service.flags(session) });
    assertSameOrigin(request);
    await service.updateFlags(session, await body(request));
    return json({ flags: await service.flags(session) });
  });

export const collaborationRuntimeHandler = (request: Request) =>
  run(async () => {
    const session = await requirePrincipal(request);
    return json(await new DelegationService(getCollaborationStore()).runtimeConfiguration(session));
  });

export const collaborationEmailSettingsHandler = (request: Request) =>
  run(async () => {
    assertSameOrigin(request);
    const session = await requirePrincipal(request);
    const service = new DelegationService(getCollaborationStore());
    if (request.method === "DELETE") {
      await service.deleteEmailConfiguration(session);
      return json(await service.runtimeConfiguration(session));
    }
    return json(await service.saveEmailConfiguration(session, await body(request)));
  });

export const userLifecycleHandler = (request: Request, userIdValue: string) =>
  run(async () => {
    assertSameOrigin(request);
    const session = await requirePrincipal(request);
    if (session.role !== "owner" && session.role !== "admin") {
      throw new SafeApplicationError("forbidden", "You do not have permission to do that.", 403);
    }
    const input = await body(request);
    if (input.action === "set_role") {
      if (input.role !== "admin" && input.role !== "delegate") {
        throw new SafeApplicationError("validation_error", "The workspace role is invalid.", 400);
      }
      await getCollaborationStore().changeUserRole({
        actorUserId: session.userId,
        role: input.role,
        targetUserId: entityIdSchema.parse(userIdValue),
        workspaceId: session.workspaceId,
      });
      return json({ changed: true });
    }
    if (input.action !== "deactivate" && input.action !== "archive") {
      throw new SafeApplicationError("validation_error", "The user action is invalid.", 400);
    }
    await getCollaborationStore().changeUserLifecycle({
      actorUserId: session.userId,
      archive: input.action === "archive",
      targetUserId: entityIdSchema.parse(userIdValue),
      workspaceId: session.workspaceId,
    });
    return json({ changed: true });
  });

export const invitationExchangeHandler = (request: Request) =>
  run(async () => {
    assertSameOrigin(request);
    await auth().consumeSensitiveAction(getNetworkSignal(request));
    const input = await body(request);
    const invitation = await new InvitationService(getCollaborationStore()).inspect(input.token);
    return json({
      accessRole: invitation.accessRole,
      accountExists: invitation.delegateUserId !== null,
      expiresAt: invitation.expiresAt,
      invitationExpiresAt: invitation.invitationExpiresAt,
      subjectTitle: invitation.subjectTitle,
      subjectType: invitation.subjectType,
      workspaceDisplayName: invitation.workspaceDisplayName,
    });
  });

export const invitationAcceptHandler = (request: Request) =>
  run(async () => {
    assertSameOrigin(request);
    await auth().consumeSensitiveAction(getNetworkSignal(request));
    const input = await body(request);
    let session = null;
    try {
      session = await requirePrincipal(request);
    } catch {
      session = null;
    }
    const accepted = await new InvitationService(getCollaborationStore()).accept({
      fullName: input.fullName,
      password: input.password,
      passwordConfirmation: input.passwordConfirmation,
      session,
      token: input.token,
    });
    if (session !== null) return json({ accepted: true, redirectTo: "/delegated" });
    const createdSession = await auth().login(
      accepted.invitedEmail,
      input.password,
      getNetworkSignal(request),
    );
    return json({ accepted: true, redirectTo: "/delegated" }, 200, {
      "set-cookie": createSessionCookie(createdSession.token, createdSession.maxAgeSeconds),
    });
  });

export const invitationDeclineHandler = (request: Request) =>
  run(async () => {
    assertSameOrigin(request);
    await auth().consumeSensitiveAction(getNetworkSignal(request));
    const input = await body(request);
    await new InvitationService(getCollaborationStore()).decline(input.token);
    return json({ declined: true });
  });

export const delegateWorkspaceHandler = (request: Request) =>
  run(async () =>
    json(
      await new DelegateService(getCollaborationStore()).workspace(await requirePrincipal(request)),
    ),
  );

export const delegateStagesHandler = (request: Request) =>
  run(async () => {
    assertSameOrigin(request);
    return json(
      {
        stage: await new DelegateService(getCollaborationStore()).createStage(
          await requirePrincipal(request),
          await body(request),
        ),
      },
      201,
    );
  });

export const delegateStageHandler = (request: Request, stageIdValue: string) =>
  run(async () => {
    assertSameOrigin(request);
    return json({
      stage: await new DelegateService(getCollaborationStore()).updateStage(
        await requirePrincipal(request),
        entityIdSchema.parse(stageIdValue),
        await body(request),
      ),
    });
  });

export const delegateTaskStateHandler = (request: Request, taskIdValue: string) =>
  run(async () => {
    assertSameOrigin(request);
    return json(
      await new DelegateService(getCollaborationStore()).updateTaskState(
        await requirePrincipal(request),
        entityIdSchema.parse(taskIdValue),
        await body(request),
      ),
    );
  });

export const delegateProjectTaskHandler = (request: Request, projectIdValue: string) =>
  run(async () => {
    assertSameOrigin(request);
    return json(
      {
        taskId: await new DelegateService(getCollaborationStore()).createProjectTask(
          await requirePrincipal(request),
          entityIdSchema.parse(projectIdValue),
          await body(request),
        ),
      },
      201,
    );
  });

export const delegateSubtasksHandler = (
  request: Request,
  taskIdValue: string,
  subtaskIdValue?: string,
) =>
  run(async () => {
    const session = await requirePrincipal(request);
    const taskId = entityIdSchema.parse(taskIdValue);
    const service = new DelegateService(getCollaborationStore());
    if (request.method === "GET") {
      return json({ subtasks: await service.listSubtasks(session, taskId) });
    }
    assertSameOrigin(request);
    if (request.method === "POST") {
      return json(
        { subtaskId: await service.createSubtask(session, taskId, await body(request)) },
        201,
      );
    }
    const subtaskId = entityIdSchema.parse(subtaskIdValue);
    if (request.method === "PATCH") {
      await service.updateSubtask(session, taskId, subtaskId, await body(request));
      return json({ changed: true });
    }
    await service.deleteSubtask(session, taskId, subtaskId);
    return json({ deleted: true });
  });

export const notificationsHandler = (request: Request) =>
  run(async () =>
    json({
      notifications: await new NotificationService(getCollaborationStore()).list(
        await requirePrincipal(request),
      ),
    }),
  );

export const notificationHandler = (request: Request, notificationIdValue: string) =>
  run(async () => {
    assertSameOrigin(request);
    const input = await body(request);
    await new NotificationService(getCollaborationStore()).update(
      await requirePrincipal(request),
      entityIdSchema.parse(notificationIdValue),
      input.state,
    );
    return json({ changed: true });
  });

export const activityHandler = (request: Request) =>
  run(async () => {
    const session = await requirePrincipal(request);
    const service = new ActivityService(getCollaborationStore());
    if (request.method === "GET") {
      const url = new URL(request.url);
      const subjectType = url.searchParams.get("subjectType");
      if (subjectType !== "project" && subjectType !== "task") {
        throw new SafeApplicationError("validation_error", "The subject type is invalid.", 400);
      }
      const subjectId = entityIdSchema.parse(url.searchParams.get("subjectId"));
      const userGeneratedValue = url.searchParams.get("userGenerated");
      const userGenerated =
        userGeneratedValue === "true" ? true : userGeneratedValue === "false" ? false : undefined;
      return json({
        events: await service.list(session, subjectType, subjectId, {
          category: url.searchParams.get("category") ?? undefined,
          dateFrom: url.searchParams.get("dateFrom") ?? undefined,
          dateTo: url.searchParams.get("dateTo") ?? undefined,
          query: url.searchParams.get("q") ?? undefined,
          userGenerated,
          userId: url.searchParams.get("userId") ?? undefined,
        }),
      });
    }
    assertSameOrigin(request);
    return json({ eventId: await service.create(session, await body(request)) }, 201);
  });

export const activityParticipantsHandler = (request: Request) =>
  run(async () => {
    const session = await requirePrincipal(request);
    const url = new URL(request.url);
    const subjectType = url.searchParams.get("subjectType");
    if (subjectType !== "project" && subjectType !== "task") {
      throw new SafeApplicationError("validation_error", "The subject type is invalid.", 400);
    }
    const subjectId = entityIdSchema.parse(url.searchParams.get("subjectId"));
    return json({
      participants: await new ActivityService(getCollaborationStore()).participants(
        session,
        subjectType,
        subjectId,
      ),
    });
  });

export const collaborationTimesheetsHandler = (
  request: Request,
  subjectTypeValue: string,
  subjectIdValue: string,
  entryIdValue?: string,
) =>
  run(async () => {
    const session = await requirePrincipal(request);
    if (subjectTypeValue !== "project" && subjectTypeValue !== "task") {
      throw new SafeApplicationError("validation_error", "The subject type is invalid.", 400);
    }
    const subjectId = entityIdSchema.parse(subjectIdValue);
    const service = new TimesheetService(getCollaborationStore());
    if (request.method === "GET") {
      return json({ entries: await service.list(session, subjectTypeValue, subjectId) });
    }
    assertSameOrigin(request);
    if (request.method === "POST") {
      await service.create(session, subjectTypeValue, subjectId, await body(request));
      return json({ created: true }, 201);
    }
    const entryId = entityIdSchema.parse(entryIdValue);
    if (request.method === "PATCH") {
      await service.update(session, subjectTypeValue, subjectId, entryId, await body(request));
      return json({ changed: true });
    }
    await service.delete(session, subjectTypeValue, subjectId, entryId);
    return json({ deleted: true });
  });

export const complianceFlagsHandler = (request: Request) =>
  run(async () =>
    json({
      flags: await new ComplianceService(getCollaborationStore()).list(
        await requirePrincipal(request),
      ),
    }),
  );

export const complianceFlagHandler = (request: Request, flagIdValue: string) =>
  run(async () => {
    assertSameOrigin(request);
    const input = await body(request);
    await new ComplianceService(getCollaborationStore()).review(
      await requirePrincipal(request),
      entityIdSchema.parse(flagIdValue),
      input.action,
    );
    return json({ reviewed: true });
  });
