import {
  SafeApplicationError,
  boardQuerySchema,
  deriveProjectMetrics,
  projectCreateSchema,
  projectStageSchema,
  projectStageUpdateSchema,
  projectUpdateSchema,
  taskCreateSchema,
  taskDependencySchema,
  taskMoveSchema,
  taskReorderSchema,
  taskUpdateSchema,
  transitiveBlockerIds,
  type KanbanSortMode,
} from "@opsweave/domain";
import { StoreConflictError, type OpsWeaveStore, type SessionRecord } from "@opsweave/db";

const conflict = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof StoreConflictError)
      throw new SafeApplicationError("conflict", error.message, 409);
    throw error;
  }
};

export class WorkService {
  public constructor(private readonly store: OpsWeaveStore) {}

  public async readWorkspace(session: SessionRecord, requestedSort?: unknown) {
    const query = boardQuerySchema.parse({ sort: requestedSort });
    const configuration = await this.store.getWorkspaceConfiguration(session.workspaceId);
    const sort: KanbanSortMode = query.sort ?? configuration.general.defaultKanbanSort;
    const [projects, stages, tasks, dependencies] = await Promise.all([
      this.store.listProjects(session.workspaceId),
      this.store.listProjectStages(session.workspaceId),
      this.store.listTasks(session.workspaceId, sort),
      this.store.listTaskDependencies(session.workspaceId),
    ]);
    const projectMetrics = Object.fromEntries(
      projects.map((project) => [
        project.id,
        deriveProjectMetrics(tasks.filter((task) => task.projectId === project.id)),
      ]),
    );
    const blockerCounts = Object.fromEntries(
      tasks.map((task) => [task.id, transitiveBlockerIds(task.id, dependencies).length]),
    );
    return { blockerCounts, dependencies, projectMetrics, projects, sort, stages, tasks };
  }

  public async createProject(session: SessionRecord, value: unknown) {
    return this.store.createProject(
      session.workspaceId,
      session.ownerId,
      projectCreateSchema.parse(value),
    );
  }

  public async updateProject(session: SessionRecord, projectId: string, value: unknown) {
    return conflict(() =>
      this.store.updateProject(
        session.workspaceId,
        session.ownerId,
        projectId,
        projectUpdateSchema.parse(value),
      ),
    );
  }

  public async createStage(session: SessionRecord, value: unknown) {
    return this.store.createProjectStage(
      session.workspaceId,
      session.ownerId,
      projectStageSchema.parse(value),
    );
  }

  public async updateStage(session: SessionRecord, stageId: string, value: unknown) {
    const input = projectStageUpdateSchema.parse(value);
    return conflict(() =>
      this.store.updateProjectStage(session.workspaceId, session.ownerId, stageId, input),
    );
  }

  public async archiveStage(session: SessionRecord, stageId: string) {
    return conflict(() =>
      this.store.archiveProjectStage(session.workspaceId, session.ownerId, stageId),
    );
  }

  public async createTask(session: SessionRecord, value: unknown) {
    return this.store.createTask(
      session.workspaceId,
      session.ownerId,
      taskCreateSchema.parse(value),
    );
  }

  public async updateTask(session: SessionRecord, taskId: string, value: unknown) {
    return conflict(() =>
      this.store.updateTask(
        session.workspaceId,
        session.ownerId,
        taskId,
        taskUpdateSchema.parse(value),
      ),
    );
  }

  public async moveTask(session: SessionRecord, taskId: string, value: unknown) {
    const input = taskMoveSchema.parse(value);
    return conflict(() =>
      this.store.moveTask(
        session.workspaceId,
        session.ownerId,
        taskId,
        input.workflowLane,
        input.version,
      ),
    );
  }

  public async reorderTask(session: SessionRecord, taskId: string, value: unknown) {
    const input = taskReorderSchema.parse(value);
    return conflict(() =>
      this.store.reorderTask(
        session.workspaceId,
        session.ownerId,
        taskId,
        input.direction,
        input.version,
      ),
    );
  }

  public async dependencies(session: SessionRecord) {
    return this.store.listTaskDependencies(session.workspaceId);
  }

  public async createDependency(session: SessionRecord, taskId: string, value: unknown) {
    const input = taskDependencySchema.parse(value);
    return conflict(() =>
      this.store.createTaskDependency(
        session.workspaceId,
        session.ownerId,
        taskId,
        input.dependsOnTaskId,
      ),
    );
  }

  public async removeDependency(session: SessionRecord, taskId: string, dependsOnTaskId: string) {
    return conflict(() =>
      this.store.removeTaskDependency(
        session.workspaceId,
        session.ownerId,
        taskId,
        dependsOnTaskId,
      ),
    );
  }
}
