import {
  SafeApplicationError,
  delegateStageCreateSchema,
  delegateStageUpdateSchema,
  delegateProjectTaskCreateSchema,
  delegateStateUpdateSchema,
  delegateSubtaskCreateSchema,
  delegateSubtaskUpdateSchema,
} from "@opsweave/domain";
import {
  StoreConflictError,
  type CollaborationStore,
  type PrincipalSessionRecord,
} from "@opsweave/db";

import { AuthorizationService } from "./authorization-service";

export class DelegateService {
  private readonly authorization: AuthorizationService;

  public constructor(private readonly store: CollaborationStore) {
    this.authorization = new AuthorizationService(store);
  }

  public async workspace(session: PrincipalSessionRecord) {
    this.authorization.requireCapability(session, "task.read");
    await this.authorization.requireCollaborationEnabled(session);
    return this.store.listDelegateWorkspace(
      session.workspaceId,
      session.membershipId,
      session.userId,
    );
  }

  public async createStage(session: PrincipalSessionRecord, value: unknown) {
    this.authorization.requireCapability(session, "delegate.stage.update");
    await this.authorization.requireCollaborationEnabled(session);
    const input = delegateStageCreateSchema.parse(value);
    return this.store.createDelegateStage(session.membershipId, input.name, input.color);
  }

  public async updateStage(session: PrincipalSessionRecord, stageId: string, value: unknown) {
    this.authorization.requireCapability(session, "delegate.stage.update");
    await this.authorization.requireCollaborationEnabled(session);
    const input = delegateStageUpdateSchema.parse(value);
    try {
      return await this.store.updateDelegateStage(
        session.membershipId,
        stageId,
        input.name,
        input.version,
      );
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new SafeApplicationError("conflict", error.message, 409);
      }
      throw error;
    }
  }

  public async updateTaskState(session: PrincipalSessionRecord, taskId: string, value: unknown) {
    this.authorization.requireCapability(session, "delegate.stage.update");
    await this.authorization.requireSubjectAccess(session, "task", taskId);
    const input = delegateStateUpdateSchema.parse(value);
    try {
      return await this.store.updateDelegateTaskState({
        latestUpdate: input.latestUpdate,
        membershipId: session.membershipId,
        stageId: input.stageId,
        taskId,
        userId: session.userId,
        version: input.version,
        workspaceId: session.workspaceId,
      });
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new SafeApplicationError("conflict", error.message, 409);
      }
      throw error;
    }
  }

  public async createProjectTask(
    session: PrincipalSessionRecord,
    projectId: string,
    value: unknown,
  ): Promise<string> {
    const access = await this.authorization.requireSubjectAccess(session, "project", projectId);
    if (session.role !== "delegate" || access?.accessRole !== "project_collaborator") {
      throw new SafeApplicationError(
        "forbidden",
        "Project collaborator access is required to create tasks.",
        403,
      );
    }
    const input = delegateProjectTaskCreateSchema.parse(value);
    try {
      return await this.store.createDelegateProjectTask({
        allocatedHours: input.allocatedHours,
        actorUserId: session.userId,
        definitionOfDone: input.definitionOfDone,
        description: input.description,
        membershipId: session.membershipId,
        projectId,
        title: input.title,
        workspaceId: session.workspaceId,
      });
    } catch (error) {
      if (error instanceof StoreConflictError)
        throw new SafeApplicationError("conflict", error.message, 409);
      throw error;
    }
  }

  private async editableTaskAccess(session: PrincipalSessionRecord, taskId: string) {
    const access = await this.authorization.requireSubjectAccess(session, "task", taskId);
    if (session.role !== "delegate" || access === null || access.accessRole === "reviewer") {
      throw new SafeApplicationError(
        "forbidden",
        "Contributor access is required to change subtasks.",
        403,
      );
    }
    return access;
  }

  public async listSubtasks(session: PrincipalSessionRecord, taskId: string) {
    await this.authorization.requireSubjectAccess(session, "task", taskId);
    return this.store.listDelegateSubtasks(taskId, session.userId);
  }

  public async createSubtask(
    session: PrincipalSessionRecord,
    taskId: string,
    value: unknown,
  ): Promise<string> {
    const access = await this.editableTaskAccess(session, taskId);
    const input = delegateSubtaskCreateSchema.parse(value);
    try {
      return await this.store.createDelegateSubtask({
        actorAlias: access.alias,
        actorUserId: session.userId,
        description: input.description,
        label: input.label,
        predictedHours: input.predictedHours,
        taskId,
        workspaceId: session.workspaceId,
      });
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new SafeApplicationError("conflict", error.message, 409);
      }
      throw error;
    }
  }

  public async updateSubtask(
    session: PrincipalSessionRecord,
    taskId: string,
    subtaskId: string,
    value: unknown,
  ): Promise<void> {
    const access = await this.editableTaskAccess(session, taskId);
    const input = delegateSubtaskUpdateSchema.parse(value);
    try {
      await this.store.updateDelegateSubtask({
        actorAlias: access.alias,
        actorUserId: session.userId,
        completed: input.completed,
        description: input.description,
        label: input.label,
        predictedHours: input.predictedHours,
        subtaskId,
        taskId,
        version: input.version,
        workspaceId: session.workspaceId,
      });
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new SafeApplicationError("conflict", error.message, 409);
      }
      throw error;
    }
  }

  public async deleteSubtask(
    session: PrincipalSessionRecord,
    taskId: string,
    subtaskId: string,
  ): Promise<void> {
    const access = await this.editableTaskAccess(session, taskId);
    try {
      await this.store.deleteDelegateSubtask({
        actorAlias: access.alias,
        actorUserId: session.userId,
        subtaskId,
        taskId,
        workspaceId: session.workspaceId,
      });
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new SafeApplicationError("conflict", error.message, 409);
      }
      throw error;
    }
  }
}
