import { SafeApplicationError } from "@opsweave/domain";
import {
  StoreConflictError,
  type CollaborationStore,
  type PrincipalSessionRecord,
} from "@opsweave/db";

import { AuthorizationService } from "./authorization-service";

export class ComplianceService {
  private readonly authorization: AuthorizationService;

  public constructor(private readonly store: CollaborationStore) {
    this.authorization = new AuthorizationService(store);
  }

  public list(session: PrincipalSessionRecord) {
    this.authorization.requireCapability(session, "compliance.review");
    return this.store.listComplianceFlags(session.workspaceId);
  }

  public async review(
    session: PrincipalSessionRecord,
    flagId: string,
    action: unknown,
  ): Promise<void> {
    this.authorization.requireCapability(session, "compliance.review");
    if (action !== "dismiss" && action !== "warn" && action !== "restrict" && action !== "revoke") {
      throw new SafeApplicationError("validation_error", "The review action is invalid.", 400);
    }
    try {
      await this.store.reviewComplianceFlag({
        action,
        actorUserId: session.userId,
        flagId,
        workspaceId: session.workspaceId,
      });
    } catch (error) {
      if (error instanceof StoreConflictError)
        throw new SafeApplicationError("conflict", error.message, 409);
      throw error;
    }
  }
}
