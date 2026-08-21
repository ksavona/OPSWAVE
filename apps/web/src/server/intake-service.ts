import {
  SafeApplicationError,
  entityIdSchema,
  intakeDraftSchema,
  intakeSubmissionSchema,
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

export class IntakeService {
  public constructor(private readonly store: OpsWeaveStore) {}

  public async submit(session: SessionRecord, value: unknown) {
    return this.store.submitIntakeSource(
      session.workspaceId,
      session.ownerId,
      intakeSubmissionSchema.parse(value),
    );
  }

  public async list(session: SessionRecord) {
    const optionalStore = this.store as OpsWeaveStore & {
      listProjectStages?: OpsWeaveStore["listProjectStages"];
      listProjects?: OpsWeaveStore["listProjects"];
    };
    const [drafts, failedRuns, projects, stages, tasks] = await Promise.all([
      this.store.listIntakeDrafts(session.workspaceId),
      this.store.listFailedIntakeRuns(session.workspaceId),
      typeof optionalStore.listProjects === "function"
        ? optionalStore.listProjects(session.workspaceId)
        : Promise.resolve([]),
      typeof optionalStore.listProjectStages === "function"
        ? optionalStore.listProjectStages(session.workspaceId)
        : Promise.resolve([]),
      typeof optionalStore.listTasks === "function"
        ? optionalStore.listTasks(session.workspaceId, "manual")
        : Promise.resolve([]),
    ]);
    return {
      drafts: drafts.map((draft) => ({
        ...draft,
        proposal: intakeDraftSchema.parse(draft.proposal),
      })),
      failedRuns,
      projects: projects.filter((project) => project.archivedAt === null),
      stages: stages.filter((stage) => stage.archivedAt === null),
      tasks,
    };
  }

  public async update(session: SessionRecord, draftId: string, value: unknown) {
    const id = entityIdSchema.parse(draftId);
    const proposal = intakeDraftSchema.parse(value);
    await conflict(() =>
      this.store.updateIntakeDraftProposal(session.workspaceId, session.ownerId, id, proposal),
    );
  }

  public async approve(session: SessionRecord, draftId: string) {
    const id = entityIdSchema.parse(draftId);
    await conflict(() => this.store.approveIntakeDraft(session.workspaceId, session.ownerId, id));
  }

  public async decline(session: SessionRecord, draftId: string) {
    const id = entityIdSchema.parse(draftId);
    await conflict(() => this.store.declineIntakeDraft(session.workspaceId, session.ownerId, id));
  }

  public async restore(session: SessionRecord, draftId: string) {
    const id = entityIdSchema.parse(draftId);
    await conflict(() => this.store.restoreIntakeDraft(session.workspaceId, session.ownerId, id));
  }

  public async retry(session: SessionRecord, runId: string) {
    const id = entityIdSchema.parse(runId);
    await conflict(() => this.store.retryIntakeRun(session.workspaceId, session.ownerId, id));
  }

  public async retryFallbackDraft(session: SessionRecord, draftId: string) {
    const id = entityIdSchema.parse(draftId);
    await conflict(() =>
      this.store.retryFallbackIntakeDraft(session.workspaceId, session.ownerId, id),
    );
  }
}
