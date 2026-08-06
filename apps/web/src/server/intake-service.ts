import { intakeDraftSchema, intakeSubmissionSchema } from "@opsweave/domain";
import type { OpsWeaveStore, SessionRecord } from "@opsweave/db";

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
    const drafts = await this.store.listIntakeDrafts(session.workspaceId);
    return drafts.map((draft) => ({ ...draft, proposal: intakeDraftSchema.parse(draft.proposal) }));
  }

  public async approve(session: SessionRecord, draftId: string) {
    await this.store.approveIntakeDraft(session.workspaceId, session.ownerId, draftId);
  }

  public async decline(session: SessionRecord, draftId: string) {
    await this.store.declineIntakeDraft(session.workspaceId, session.ownerId, draftId);
  }
}
