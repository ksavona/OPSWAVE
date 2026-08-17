import {
  SafeApplicationError,
  boardQuerySchema,
  deriveProjectMetrics,
  entityDependencySchema,
  entityIdSchema,
  projectCreateSchema,
  projectDependencySchema,
  projectScheduleMoveSchema,
  projectStageSchema,
  projectStageUpdateSchema,
  projectUpdateSchema,
  taskCreateSchema,
  taskDependencySchema,
  taskMoveSchema,
  taskReorderSchema,
  taskScheduleMoveSchema,
  taskSplitSchema,
  taskTimeEntryCreateSchema,
  taskUpdateSchema,
  transitiveBlockerIds,
  type KanbanSortMode,
} from "@opsweave/domain";
import { DeterministicFakeAiProvider, OpenAiProvider } from "@opsweave/ai";
import { StoreConflictError, type OpsWeaveStore, type SessionRecord } from "@opsweave/db";

import { readAttachmentFile, readAttachmentTextContext } from "./attachment-storage";

const MAX_SPLIT_FILE_CONTEXT_BYTES = 40 * 1024 * 1024;
const modelDocumentExtension =
  /\.(?:csv|doc|docx|html?|json|md|markdown|odt|pdf|ppt|pptx|rtf|sql|text|tsv|txt|xls|xlsx|xml)$/iu;
const modelImageTypes = new Set(["image/gif", "image/jpeg", "image/png", "image/webp"]);
const modelContentType = (name: string, storedType: string): string => {
  if (storedType !== "application/octet-stream") return storedType;
  const extension = name.toLowerCase().split(".").at(-1);
  return (
    {
      csv: "text/csv",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      html: "text/html",
      json: "application/json",
      md: "text/markdown",
      odt: "application/vnd.oasis.opendocument.text",
      pdf: "application/pdf",
      ppt: "application/vnd.ms-powerpoint",
      pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      rtf: "application/rtf",
      tsv: "text/tsv",
      txt: "text/plain",
      xls: "application/vnd.ms-excel",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      xml: "text/xml",
    }[extension ?? ""] ?? storedType
  );
};

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
    const [projects, stages, storedTasks, entityDependencies, projectDirectTime] =
      await Promise.all([
        this.store.listProjects(session.workspaceId),
        this.store.listProjectStages(session.workspaceId),
        this.store.listTasks(session.workspaceId, sort),
        this.store.listEntityDependencies(session.workspaceId),
        this.store.listProjectDirectTimeTotals(session.workspaceId),
      ]);
    const dependencies = entityDependencies.flatMap((dependency) =>
      dependency.dependentType === "task" && dependency.blockerType === "task"
        ? [{ dependsOnTaskId: dependency.blockerId, taskId: dependency.dependentId }]
        : [],
    );
    const tasks =
      sort === "dependency"
        ? (() => {
            const byId = new Map(storedTasks.map((task) => [task.id, task]));
            const blockers = new Map<string, string[]>();
            for (const edge of dependencies)
              blockers.set(edge.taskId, [
                ...(blockers.get(edge.taskId) ?? []),
                edge.dependsOnTaskId,
              ]);
            const visited = new Set<string>();
            const visiting = new Set<string>();
            const ordered: typeof storedTasks = [];
            const visit = (taskId: string) => {
              if (visited.has(taskId) || visiting.has(taskId)) return;
              visiting.add(taskId);
              for (const blockerId of blockers.get(taskId) ?? [])
                if (byId.has(blockerId)) visit(blockerId);
              visiting.delete(taskId);
              visited.add(taskId);
              const task = byId.get(taskId);
              if (task !== undefined) ordered.push(task);
            };
            for (const task of storedTasks) visit(task.id);
            return ordered;
          })()
        : storedTasks;
    const projectDependencies = entityDependencies.flatMap((dependency) =>
      dependency.dependentType === "project" && dependency.blockerType === "project"
        ? [{ dependsOnProjectId: dependency.blockerId, projectId: dependency.dependentId }]
        : [],
    );
    const projectMetrics = Object.fromEntries(
      projects.map((project) => {
        const metrics = deriveProjectMetrics(tasks.filter((task) => task.projectId === project.id));
        return [
          project.id,
          { ...metrics, hoursSpent: metrics.hoursSpent + (projectDirectTime[project.id] ?? 0) },
        ];
      }),
    );
    const blockerCounts = Object.fromEntries(
      tasks.map((task) => [task.id, transitiveBlockerIds(task.id, dependencies).length]),
    );
    const clientNames = [
      ...new Set(
        [...projects.map((project) => project.clientName), ...tasks.map((task) => task.clientName)]
          .filter((name): name is string => typeof name === "string")
          .map((name) => name.trim())
          .filter((name) => name.length > 0),
      ),
    ].sort((left, right) => left.localeCompare(right));
    return {
      blockerCounts,
      clientNames,
      dependencies,
      entityDependencies,
      projectDependencies,
      projectMetrics,
      projects,
      sort,
      stages,
      tasks,
      workingDays: configuration.workingDays,
    };
  }

  public async createProject(session: SessionRecord, value: unknown) {
    return this.store.createProject(
      session.workspaceId,
      session.ownerId,
      projectCreateSchema.parse(value),
    );
  }

  public async updateProject(session: SessionRecord, projectId: string, value: unknown) {
    const id = entityIdSchema.parse(projectId);
    return conflict(() =>
      this.store.updateProject(
        session.workspaceId,
        session.ownerId,
        id,
        projectUpdateSchema.parse(value),
      ),
    );
  }

  public async deleteProject(session: SessionRecord, projectId: string, value: unknown) {
    const id = entityIdSchema.parse(projectId);
    const version = taskMoveSchema.pick({ version: true }).parse(value).version;
    return conflict(() =>
      this.store.deleteProject(session.workspaceId, session.ownerId, id, version),
    );
  }

  public async listTaskTimeEntries(session: SessionRecord, taskId: string) {
    return this.store.listTaskTimeEntries(session.workspaceId, entityIdSchema.parse(taskId));
  }

  public async addTaskTimeEntry(session: SessionRecord, taskId: string, value: unknown) {
    return conflict(() =>
      this.store.addTaskTimeEntry(
        session.workspaceId,
        session.ownerId,
        entityIdSchema.parse(taskId),
        taskTimeEntryCreateSchema.parse(value),
      ),
    );
  }

  public async deleteTaskTimeEntry(session: SessionRecord, taskId: string, entryId: string) {
    return conflict(() =>
      this.store.deleteTaskTimeEntry(
        session.workspaceId,
        session.ownerId,
        entityIdSchema.parse(taskId),
        entityIdSchema.parse(entryId),
      ),
    );
  }

  public async splitMegaTask(session: SessionRecord, taskId: string, value: unknown) {
    const id = entityIdSchema.parse(taskId);
    const input = taskSplitSchema.parse(value);
    const [tasks, projects, dependencies] = await Promise.all([
      this.store.listTasks(session.workspaceId, "manual"),
      this.store.listProjects(session.workspaceId),
      this.store.listEntityDependencies(session.workspaceId),
    ]);
    const task = tasks.find((candidate) => candidate.id === id);
    if (task === undefined)
      throw new SafeApplicationError("validation_error", "Task not found.", 404);
    const hoursLeft = task.hoursLeft;
    if (input.mode === "tasks" && hoursLeft <= 2)
      throw new SafeApplicationError(
        "validation_error",
        "Only a task with more than two remaining hours can be split into separate tasks.",
        400,
      );
    const project = projects.find((candidate) => candidate.id === task.projectId) ?? null;
    const relatedTasks =
      task.projectId === null
        ? []
        : tasks.filter(
            (candidate) => candidate.projectId === task.projectId && candidate.id !== task.id,
          );
    const directDependencies = dependencies.filter(
      (edge) => edge.dependentId === id || edge.blockerId === id,
    );
    const dependencyRecords = directDependencies.map((edge) => ({
      blocker:
        edge.blockerType === "task"
          ? (tasks.find((candidate) => candidate.id === edge.blockerId) ?? null)
          : (projects.find((candidate) => candidate.id === edge.blockerId) ?? null),
      dependent:
        edge.dependentType === "task"
          ? (tasks.find((candidate) => candidate.id === edge.dependentId) ?? null)
          : (projects.find((candidate) => candidate.id === edge.dependentId) ?? null),
      edge,
    }));
    const rawAttachmentTargets = [
      { id: task.id, label: "current task", type: "task" as const },
      ...(project === null
        ? []
        : [{ id: project.id, label: "linked project", type: "project" as const }]),
      ...relatedTasks.map((candidate) => ({
        id: candidate.id,
        label: `related task: ${candidate.title}`,
        type: "task" as const,
      })),
      ...directDependencies.flatMap((edge) => [
        {
          id: edge.blockerId,
          label: "direct dependency blocker",
          type: edge.blockerType,
        },
        {
          id: edge.dependentId,
          label: "direct dependency dependent",
          type: edge.dependentType,
        },
      ]),
    ];
    const attachmentTargets = [
      ...new Map(
        rawAttachmentTargets.map((target) => [`${target.type}:${target.id}`, target]),
      ).values(),
    ];
    const attachmentGroups = await Promise.all(
      attachmentTargets.map(async (target) => ({
        ...target,
        attachments: await this.store.listAttachments(session.workspaceId, target.type, target.id),
      })),
    );
    const apiKey = process.env.OPENAI_API_KEY;
    const canUseModelFiles = apiKey !== undefined && apiKey.length > 0;
    let remainingTextBudget = 200_000;
    let remainingFileBudget = MAX_SPLIT_FILE_CONTEXT_BYTES;
    const files: { dataUrl: string; kind: "document" | "image"; name: string }[] = [];
    const documents: {
      byteSize: number;
      content: string | null;
      contentStatus: string;
      contentType: string;
      name: string;
      source: string;
    }[] = [];
    for (const group of attachmentGroups)
      for (const attachment of group.attachments) {
        const extracted =
          remainingTextBudget > 0
            ? await readAttachmentTextContext(attachment)
            : { content: null, contentStatus: "Overall document context limit reached." };
        const content = extracted.content?.slice(0, remainingTextBudget) ?? null;
        remainingTextBudget -= content?.length ?? 0;
        const fileKind = modelImageTypes.has(attachment.contentType)
          ? ("image" as const)
          : modelDocumentExtension.test(attachment.originalName)
            ? ("document" as const)
            : null;
        let modelInputStatus = "";
        if (!canUseModelFiles)
          modelInputStatus = " Binary model input is unavailable with the local fallback provider.";
        else if (fileKind === null)
          modelInputStatus = " This file type is not supported as a model input.";
        else if (attachment.byteSize > remainingFileBudget)
          modelInputStatus =
            " Omitted from model input because the combined file limit was reached.";
        else
          try {
            const bytes = await readAttachmentFile(attachment.storageKey);
            const contentType = modelContentType(attachment.originalName, attachment.contentType);
            files.push({
              dataUrl: `data:${contentType};base64,${bytes.toString("base64")}`,
              kind: fileKind,
              name: attachment.originalName,
            });
            remainingFileBudget -= bytes.byteLength;
            modelInputStatus = " Included as a direct model input.";
          } catch {
            modelInputStatus = " Document content is currently unavailable.";
          }
        documents.push({
          byteSize: attachment.byteSize,
          content: modelInputStatus === " Included as a direct model input." ? null : content,
          contentStatus: `${extracted.contentStatus}${modelInputStatus}`.trim(),
          contentType: attachment.contentType,
          name: attachment.originalName,
          source: group.label,
        });
      }
    const context = {
      checklist: task.checklist,
      dependencies: dependencyRecords,
      documents,
      project,
      relatedTasks,
      task,
      title: task.title,
    };
    const provider =
      apiKey === undefined || apiKey.length === 0
        ? new DeterministicFakeAiProvider()
        : new OpenAiProvider({
            apiKey,
            model: process.env.OPENAI_DEFAULT_MODEL ?? "gpt-5.6",
          });
    const result = await provider.splitMegaTask({
      context,
      files,
      mode: input.mode,
      totalHours: Math.max(
        0.25,
        hoursLeft || task.checklist.reduce((sum, item) => sum + (item.predictedHours ?? 0), 0),
      ),
    });
    if (input.mode === "subtasks") {
      await conflict(() =>
        this.store.replaceTaskChecklist(
          session.workspaceId,
          session.ownerId,
          id,
          input.version,
          result.items.map((item) => ({
            description: item.description,
            predictedHours: item.allocatedHours,
            title: item.title,
          })),
          result.provider,
        ),
      );
      return { count: result.items.length, mode: input.mode, provider: result.provider };
    }
    const createdTaskIds = await conflict(() =>
      this.store.splitMegaTaskIntoTasks(
        session.workspaceId,
        session.ownerId,
        id,
        input.version,
        result.items.map((item) => ({
          description: item.description,
          hours: item.allocatedHours,
          title: item.title,
        })),
        result.provider,
      ),
    );
    return { createdTaskIds, mode: input.mode, provider: result.provider };
  }

  public async moveProjectSchedule(session: SessionRecord, projectId: string, value: unknown) {
    const input = projectScheduleMoveSchema.parse(value);
    return conflict(() =>
      this.store.shiftProjectSchedule(
        session.workspaceId,
        session.ownerId,
        entityIdSchema.parse(projectId),
        input.version,
        input.deltaMinutes,
      ),
    );
  }

  public async createProjectDependency(session: SessionRecord, projectId: string, value: unknown) {
    const id = entityIdSchema.parse(projectId);
    const input = projectDependencySchema.parse(value);
    return conflict(() =>
      this.store.createProjectDependency(
        session.workspaceId,
        session.ownerId,
        id,
        input.dependsOnProjectId,
      ),
    );
  }

  public async removeProjectDependency(
    session: SessionRecord,
    projectId: string,
    dependsOnProjectId: string,
  ) {
    const id = entityIdSchema.parse(projectId);
    const blockerId = entityIdSchema.parse(dependsOnProjectId);
    return conflict(() =>
      this.store.removeProjectDependency(session.workspaceId, session.ownerId, id, blockerId),
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
    const id = entityIdSchema.parse(stageId);
    const input = projectStageUpdateSchema.parse(value);
    return conflict(() =>
      this.store.updateProjectStage(session.workspaceId, session.ownerId, id, input),
    );
  }

  public async archiveStage(session: SessionRecord, stageId: string) {
    const id = entityIdSchema.parse(stageId);
    return conflict(() => this.store.archiveProjectStage(session.workspaceId, session.ownerId, id));
  }

  public async createTask(session: SessionRecord, value: unknown) {
    return this.store.createTask(
      session.workspaceId,
      session.ownerId,
      taskCreateSchema.parse(value),
    );
  }

  public async updateTask(session: SessionRecord, taskId: string, value: unknown) {
    const id = entityIdSchema.parse(taskId);
    return conflict(() =>
      this.store.updateTask(
        session.workspaceId,
        session.ownerId,
        id,
        taskUpdateSchema.parse(value),
      ),
    );
  }

  public async moveTaskSchedule(session: SessionRecord, taskId: string, value: unknown) {
    const input = taskScheduleMoveSchema.parse(value);
    return conflict(() =>
      this.store.rescheduleTask(
        session.workspaceId,
        session.ownerId,
        entityIdSchema.parse(taskId),
        input.version,
        new Date(input.startAt),
      ),
    );
  }

  public async deleteTask(session: SessionRecord, taskId: string, value: unknown) {
    const id = entityIdSchema.parse(taskId);
    const version = taskMoveSchema.pick({ version: true }).parse(value).version;
    return conflict(() => this.store.deleteTask(session.workspaceId, session.ownerId, id, version));
  }

  public async moveTask(session: SessionRecord, taskId: string, value: unknown) {
    const id = entityIdSchema.parse(taskId);
    const input = taskMoveSchema.parse(value);
    return conflict(() =>
      this.store.moveTask(
        session.workspaceId,
        session.ownerId,
        id,
        input.workflowLane,
        input.version,
      ),
    );
  }

  public async reorderTask(session: SessionRecord, taskId: string, value: unknown) {
    const id = entityIdSchema.parse(taskId);
    const input = taskReorderSchema.parse(value);
    return conflict(() =>
      this.store.reorderTask(
        session.workspaceId,
        session.ownerId,
        id,
        input.direction,
        input.version,
      ),
    );
  }

  public async dependencies(session: SessionRecord) {
    return this.store.listTaskDependencies(session.workspaceId);
  }

  public async createDependency(session: SessionRecord, taskId: string, value: unknown) {
    const id = entityIdSchema.parse(taskId);
    const input = taskDependencySchema.parse(value);
    return conflict(() =>
      this.store.createTaskDependency(
        session.workspaceId,
        session.ownerId,
        id,
        input.dependsOnTaskId,
      ),
    );
  }

  public async removeDependency(session: SessionRecord, taskId: string, dependsOnTaskId: string) {
    const id = entityIdSchema.parse(taskId);
    const blockerId = entityIdSchema.parse(dependsOnTaskId);
    return conflict(() =>
      this.store.removeTaskDependency(session.workspaceId, session.ownerId, id, blockerId),
    );
  }

  public async audit(session: SessionRecord, entityType: "project" | "task", entityId: string) {
    return this.store.listEntityAuditEvents(
      session.workspaceId,
      entityType,
      entityIdSchema.parse(entityId),
    );
  }

  public async createEntityDependency(
    session: SessionRecord,
    dependentType: "project" | "task",
    dependentId: string,
    value: unknown,
  ) {
    const input = entityDependencySchema.parse(value);
    return conflict(() =>
      this.store.createEntityDependency(
        session.workspaceId,
        session.ownerId,
        dependentType,
        entityIdSchema.parse(dependentId),
        input.blockerType,
        input.blockerId,
      ),
    );
  }

  public async removeEntityDependency(
    session: SessionRecord,
    dependentType: "project" | "task",
    dependentId: string,
    blockerType: "project" | "task",
    blockerId: string,
  ) {
    return conflict(() =>
      this.store.removeEntityDependency(
        session.workspaceId,
        session.ownerId,
        dependentType,
        entityIdSchema.parse(dependentId),
        blockerType,
        entityIdSchema.parse(blockerId),
      ),
    );
  }
}
