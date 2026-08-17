import { SafeApplicationError, entityIdSchema, safeErrorResponse } from "@opsweave/domain";

import { AuthService } from "./auth-service";
import { createRateLimitGate } from "./rate-limits";
import {
  assertSameOrigin,
  clearSessionCookie,
  createSessionCookie,
  getNetworkSignal,
  readCookie,
} from "./request-security";
import { getStore, logger } from "./runtime";
import { SettingsService } from "./settings-service";
import { IntakeService } from "./intake-service";
import { PlanningService } from "./planning-service";
import { ReportingService } from "./reporting-service";
import { WorkService } from "./work-service";
import {
  MAX_ATTACHMENT_BYTES,
  readAttachmentFile,
  removeAttachmentFile,
  saveAttachmentFile,
} from "./attachment-storage";

let authService: AuthService | undefined;
let settingsService: SettingsService | undefined;
let workService: WorkService | undefined;
let intakeService: IntakeService | undefined;
let planningService: PlanningService | undefined;
let reportingService: ReportingService | undefined;
const auth = () => (authService ??= new AuthService(getStore(), createRateLimitGate()));
const settings = () => (settingsService ??= new SettingsService(getStore()));
const work = () => (workService ??= new WorkService(getStore()));
const intake = () => (intakeService ??= new IntakeService(getStore()));
const planning = () => (planningService ??= new PlanningService(getStore(), logger));
const reporting = () => (reportingService ??= new ReportingService(getStore()));

const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  Response.json(body, { status, ...(headers === undefined ? {} : { headers }) });

const DEFAULT_REQUEST_BODY_LIMIT = 16_384;
const INTAKE_REQUEST_BODY_LIMIT = 1_000_000;

const body = async (
  request: Request,
  maximumLength = DEFAULT_REQUEST_BODY_LIMIT,
): Promise<unknown> => {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > maximumLength) {
    throw new SafeApplicationError("validation_error", "The request body is too large.", 413);
  }
  const text = await request.text();
  if (text.length > maximumLength) {
    throw new SafeApplicationError("validation_error", "The request body is too large.", 413);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new SafeApplicationError("validation_error", "The request body is invalid.", 400);
  }
};

const objectBody = async (request: Request): Promise<Record<string, unknown>> => {
  const value = await body(request);
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new SafeApplicationError("validation_error", "The request body is invalid.", 400);
  }
  return value as Record<string, unknown>;
};

const run = async (operation: () => Promise<Response>): Promise<Response> => {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return json({ error: "validation_error", message: "Review the submitted values." }, 400);
    }
    const safe = safeErrorResponse(error);
    if (safe.status === 500) logger.error({ err: error }, "request failed safely");
    return json(safe.body, safe.status);
  }
};

const requireSession = async (request: Request) => auth().authenticateToken(readCookie(request));

export const loginHandler = (request: Request) =>
  run(async () => {
    assertSameOrigin(request);
    const input = await objectBody(request);
    const session = await auth().login(input.username, input.password, getNetworkSignal(request));
    return json({ authenticated: true, username: session.record.username }, 200, {
      "set-cookie": createSessionCookie(session.token, session.maxAgeSeconds),
    });
  });

export const logoutHandler = (request: Request) =>
  run(async () => {
    assertSameOrigin(request);
    await auth().logout(await requireSession(request));
    return json({ authenticated: false }, 200, { "set-cookie": clearSessionCookie() });
  });

export const sessionHandler = (request: Request) =>
  run(async () => {
    const session = await requireSession(request);
    return json({
      authenticated: true,
      createdAt: session.createdAt,
      lastSeenAt: session.lastSeenAt,
      username: session.username,
    });
  });

export const settingsHandler = (request: Request) =>
  run(async () => json(await settings().read(await requireSession(request))));

export const generalSettingsHandler = (request: Request) =>
  run(async () => {
    assertSameOrigin(request);
    const version = await settings().updateGeneral(
      await requireSession(request),
      await body(request),
    );
    return json({ saved: true, version });
  });

export const workingTimeHandler = (request: Request) =>
  run(async () => {
    assertSameOrigin(request);
    return json({
      ...(await settings().updateWorkingTime(await requireSession(request), await body(request))),
      saved: true,
    });
  });

export const prioritizationHandler = (request: Request) =>
  run(async () => {
    assertSameOrigin(request);
    const version = await settings().updatePrioritization(
      await requireSession(request),
      await body(request),
    );
    return json({ saved: true, version });
  });

export const saveCredentialHandler = (request: Request) =>
  run(async () => {
    assertSameOrigin(request);
    const input = await objectBody(request);
    const session = await requireSession(request);
    await auth().consumeSensitiveAction(`provider:${session.ownerId}`);
    return json(await settings().saveCredential(session, input.credential));
  });

export const removeCredentialHandler = (request: Request) =>
  run(async () => {
    assertSameOrigin(request);
    const session = await requireSession(request);
    await auth().consumeSensitiveAction(`provider:${session.ownerId}`);
    return json(await settings().removeCredential(session));
  });

export const testCredentialHandler = (request: Request) =>
  run(async () => {
    assertSameOrigin(request);
    const session = await requireSession(request);
    await auth().consumeSensitiveAction(`provider:${session.ownerId}`);
    return json(await settings().testCredential(session));
  });

export const changePasswordHandler = (request: Request) =>
  run(async () => {
    assertSameOrigin(request);
    const input = await objectBody(request);
    const rotated = await auth().changePassword({
      currentPassword: input.currentPassword,
      newPassword: input.newPassword,
      newPasswordConfirmation: input.newPasswordConfirmation,
      session: await requireSession(request),
    });
    return json({ changed: true }, 200, {
      "set-cookie": createSessionCookie(rotated.token, rotated.maxAgeSeconds),
    });
  });

export const revokeOtherSessionsHandler = (request: Request) =>
  run(async () => {
    assertSameOrigin(request);
    const revokedCount = await auth().revokeOthers(await requireSession(request));
    return json({ revokedCount });
  });

export const securitySettingsHandler = (request: Request) =>
  run(async () => {
    const session = await requireSession(request);
    const owner = await getStore().getOnlyOwnerCredential();
    if (owner === null) throw new Error("Owner record missing.");
    return json({
      otherActiveSessionCount: await getStore().countOtherActiveSessions(
        session.ownerId,
        session.id,
        new Date(),
      ),
      passwordChangedAt: owner.passwordChangedAt,
      sessionCreatedAt: session.createdAt,
      sessionLastSeenAt: session.lastSeenAt,
      username: session.username,
    });
  });

export const workspaceHandler = (request: Request) =>
  run(async () => {
    const session = await requireSession(request);
    const sort = new URL(request.url).searchParams.get("sort") ?? undefined;
    return json(await work().readWorkspace(session, sort));
  });

export const intakeHandler = (request: Request) =>
  run(async () => {
    const session = await requireSession(request);
    if (request.method === "GET") return json(await intake().list(session));
    assertSameOrigin(request);
    return json(
      await intake().submit(session, await body(request, INTAKE_REQUEST_BODY_LIMIT)),
      202,
    );
  });

export const approveIntakeDraftHandler = (request: Request, draftId: string) =>
  run(async () => {
    assertSameOrigin(request);
    await intake().approve(await requireSession(request), draftId);
    return json({ approved: true });
  });

export const updateIntakeDraftHandler = (request: Request, draftId: string) =>
  run(async () => {
    assertSameOrigin(request);
    await intake().update(await requireSession(request), draftId, await body(request));
    return json({ saved: true });
  });

export const declineIntakeDraftHandler = (request: Request, draftId: string) =>
  run(async () => {
    assertSameOrigin(request);
    await intake().decline(await requireSession(request), draftId);
    return json({ declined: true });
  });

export const restoreIntakeDraftHandler = (request: Request, draftId: string) =>
  run(async () => {
    assertSameOrigin(request);
    await intake().restore(await requireSession(request), draftId);
    return json({ restored: true });
  });

export const retryIntakeRunHandler = (request: Request, runId: string) =>
  run(async () => {
    assertSameOrigin(request);
    await intake().retry(await requireSession(request), runId);
    return json({ queued: true }, 202);
  });

export const retryFallbackIntakeDraftHandler = (request: Request, draftId: string) =>
  run(async () => {
    assertSameOrigin(request);
    await intake().retryFallbackDraft(await requireSession(request), draftId);
    return json({ queued: true }, 202);
  });

export const planningPreviewHandler = (request: Request) =>
  run(async () => {
    assertSameOrigin(request);
    return json(await planning().preview(await requireSession(request)));
  });

export const planningRunHandler = (request: Request) =>
  run(async () => {
    assertSameOrigin(request);
    return json(await planning().runManual(await requireSession(request), await body(request)));
  });

export const reportingHandler = (request: Request) =>
  run(async () => json(await reporting().report(await requireSession(request))));

export const reportingCsvHandler = (request: Request) =>
  run(
    async () =>
      new Response(await reporting().taskCsv(await requireSession(request)), {
        headers: {
          "content-disposition": 'attachment; filename="opsweave-tasks.csv"',
          "content-type": "text/csv; charset=utf-8",
        },
      }),
  );

export const createProjectHandler = (request: Request) =>
  run(async () => {
    assertSameOrigin(request);
    return json(
      await work().createProject(await requireSession(request), await body(request)),
      201,
    );
  });

export const updateProjectHandler = (request: Request, projectId: string) =>
  run(async () => {
    assertSameOrigin(request);
    return json(
      await work().updateProject(await requireSession(request), projectId, await body(request)),
    );
  });

export const deleteProjectHandler = (request: Request, projectId: string) =>
  run(async () => {
    assertSameOrigin(request);
    await work().deleteProject(await requireSession(request), projectId, await body(request));
    return json({ deleted: true });
  });

export const attachmentsHandler = (
  request: Request,
  entityType: "project" | "task",
  entityId: string,
) =>
  run(async () => {
    const session = await requireSession(request);
    const id = entityIdSchema.parse(entityId);
    if (request.method === "GET")
      return json(await getStore().listAttachments(session.workspaceId, entityType, id));
    assertSameOrigin(request);
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > MAX_ATTACHMENT_BYTES + 1_000_000)
      throw new SafeApplicationError(
        "validation_error",
        "The attachment is larger than 25 MB.",
        413,
      );
    const submitted = await request.formData();
    const file = submitted.get("file");
    if (!(file instanceof File))
      throw new SafeApplicationError("validation_error", "Choose a document to upload.", 400);
    if (file.size <= 0 || file.size > MAX_ATTACHMENT_BYTES)
      throw new SafeApplicationError(
        "validation_error",
        "Attachments must be between 1 byte and 25 MB.",
        413,
      );
    const originalName = file.name.split(/[\\/]/u).at(-1)?.trim().slice(0, 500) ?? "document";
    let storageKey: string | undefined;
    try {
      storageKey = await saveAttachmentFile(file);
      return json(
        await getStore().addAttachment(session.workspaceId, session.ownerId, {
          byteSize: file.size,
          contentType: file.type.trim().slice(0, 255) || "application/octet-stream",
          entityId: id,
          entityType,
          originalName,
          storageKey,
        }),
        201,
      );
    } catch (error) {
      if (storageKey !== undefined) await removeAttachmentFile(storageKey);
      throw error;
    }
  });

export const attachmentHandler = (request: Request, attachmentId: string) =>
  run(async () => {
    const session = await requireSession(request);
    const id = entityIdSchema.parse(attachmentId);
    const attachment = await getStore().getAttachment(session.workspaceId, id);
    if (attachment === null)
      throw new SafeApplicationError("validation_error", "Attachment not found.", 404);
    if (request.method === "GET") {
      const bytes = await readAttachmentFile(attachment.storageKey);
      const encodedName = encodeURIComponent(attachment.originalName).replaceAll("'", "%27");
      const inline =
        new URL(request.url).searchParams.get("inline") === "1" &&
        ["image/gif", "image/jpeg", "image/png", "image/webp"].includes(attachment.contentType);
      return new Response(new Uint8Array(bytes), {
        headers: {
          "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodedName}`,
          "content-length": String(bytes.byteLength),
          "content-type": attachment.contentType,
          "x-content-type-options": "nosniff",
        },
      });
    }
    assertSameOrigin(request);
    const removed = await getStore().deleteAttachment(session.workspaceId, session.ownerId, id);
    await removeAttachmentFile(removed.storageKey);
    return json({ deleted: true });
  });

export const entityAuditHandler = (
  request: Request,
  entityType: "project" | "task",
  entityId: string,
) => run(async () => json(await work().audit(await requireSession(request), entityType, entityId)));

export const createEntityDependencyHandler = (
  request: Request,
  dependentType: "project" | "task",
  dependentId: string,
) =>
  run(async () => {
    assertSameOrigin(request);
    await work().createEntityDependency(
      await requireSession(request),
      dependentType,
      dependentId,
      await body(request),
    );
    return json({ created: true }, 201);
  });

export const removeEntityDependencyHandler = (
  request: Request,
  dependentType: "project" | "task",
  dependentId: string,
  blockerType: "project" | "task",
  blockerId: string,
) =>
  run(async () => {
    assertSameOrigin(request);
    await work().removeEntityDependency(
      await requireSession(request),
      dependentType,
      dependentId,
      blockerType,
      blockerId,
    );
    return json({ removed: true });
  });

export const createProjectDependencyHandler = (request: Request, projectId: string) =>
  run(async () => {
    assertSameOrigin(request);
    await work().createProjectDependency(
      await requireSession(request),
      projectId,
      await body(request),
    );
    return json({ created: true }, 201);
  });

export const removeProjectDependencyHandler = (
  request: Request,
  projectId: string,
  dependsOnProjectId: string,
) =>
  run(async () => {
    assertSameOrigin(request);
    await work().removeProjectDependency(
      await requireSession(request),
      projectId,
      dependsOnProjectId,
    );
    return json({ removed: true });
  });

export const createProjectStageHandler = (request: Request) =>
  run(async () => {
    assertSameOrigin(request);
    return json(await work().createStage(await requireSession(request), await body(request)), 201);
  });

export const updateProjectStageHandler = (request: Request, stageId: string) =>
  run(async () => {
    assertSameOrigin(request);
    return json(
      await work().updateStage(await requireSession(request), stageId, await body(request)),
    );
  });

export const archiveProjectStageHandler = (request: Request, stageId: string) =>
  run(async () => {
    assertSameOrigin(request);
    await work().archiveStage(await requireSession(request), stageId);
    return json({ archived: true });
  });

export const createTaskHandler = (request: Request) =>
  run(async () => {
    assertSameOrigin(request);
    return json(await work().createTask(await requireSession(request), await body(request)), 201);
  });

export const updateTaskHandler = (request: Request, taskId: string) =>
  run(async () => {
    assertSameOrigin(request);
    return json(
      await work().updateTask(await requireSession(request), taskId, await body(request)),
    );
  });

export const moveTaskScheduleHandler = (request: Request, taskId: string) =>
  run(async () => {
    assertSameOrigin(request);
    await work().moveTaskSchedule(await requireSession(request), taskId, await body(request));
    return json({ moved: true });
  });

export const moveProjectScheduleHandler = (request: Request, projectId: string) =>
  run(async () => {
    assertSameOrigin(request);
    await work().moveProjectSchedule(await requireSession(request), projectId, await body(request));
    return json({ moved: true });
  });

export const deleteTaskHandler = (request: Request, taskId: string) =>
  run(async () => {
    assertSameOrigin(request);
    await work().deleteTask(await requireSession(request), taskId, await body(request));
    return json({ deleted: true });
  });

export const taskTimeEntriesHandler = (request: Request, taskId: string) =>
  run(async () => {
    const session = await requireSession(request);
    if (request.method === "GET") return json(await work().listTaskTimeEntries(session, taskId));
    assertSameOrigin(request);
    return json(await work().addTaskTimeEntry(session, taskId, await body(request)), 201);
  });

export const deleteTaskTimeEntryHandler = (request: Request, taskId: string, entryId: string) =>
  run(async () => {
    assertSameOrigin(request);
    return json(await work().deleteTaskTimeEntry(await requireSession(request), taskId, entryId));
  });

export const splitMegaTaskHandler = (request: Request, taskId: string) =>
  run(async () => {
    assertSameOrigin(request);
    return json(
      await work().splitMegaTask(await requireSession(request), taskId, await body(request)),
    );
  });

export const moveTaskHandler = (request: Request, taskId: string) =>
  run(async () => {
    assertSameOrigin(request);
    return json(await work().moveTask(await requireSession(request), taskId, await body(request)));
  });

export const reorderTaskHandler = (request: Request, taskId: string) =>
  run(async () => {
    assertSameOrigin(request);
    return json({
      version: await work().reorderTask(await requireSession(request), taskId, await body(request)),
    });
  });

export const taskDependenciesHandler = (request: Request) =>
  run(async () => json(await work().dependencies(await requireSession(request))));

export const createTaskDependencyHandler = (request: Request, taskId: string) =>
  run(async () => {
    assertSameOrigin(request);
    await work().createDependency(await requireSession(request), taskId, await body(request));
    return json({ created: true }, 201);
  });

export const removeTaskDependencyHandler = (
  request: Request,
  taskId: string,
  dependsOnTaskId: string,
) =>
  run(async () => {
    assertSameOrigin(request);
    await work().removeDependency(await requireSession(request), taskId, dependsOnTaskId);
    return json({ removed: true });
  });

export const resetHttpServicesForTests = () => {
  authService = undefined;
  settingsService = undefined;
  workService = undefined;
  intakeService = undefined;
  planningService = undefined;
  reportingService = undefined;
};

export const configureHttpServicesForTests = (services: {
  readonly auth?: AuthService;
  readonly settings?: SettingsService;
  readonly work?: WorkService;
  readonly intake?: IntakeService;
  readonly planning?: PlanningService;
  readonly reporting?: ReportingService;
}) => {
  authService = services.auth;
  settingsService = services.settings;
  workService = services.work;
  intakeService = services.intake;
  planningService = services.planning;
  reportingService = services.reporting;
};
