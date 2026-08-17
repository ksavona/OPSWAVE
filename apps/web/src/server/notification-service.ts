import { SafeApplicationError } from "@opsweave/domain";
import {
  StoreConflictError,
  type CollaborationStore,
  type PrincipalSessionRecord,
} from "@opsweave/db";

import { AuthorizationService } from "./authorization-service";

export class NotificationService {
  private readonly authorization: AuthorizationService;

  public constructor(private readonly store: CollaborationStore) {
    this.authorization = new AuthorizationService(store);
  }

  public list(session: PrincipalSessionRecord) {
    this.authorization.requireCapability(session, "notifications.read");
    return this.store.listNotifications(session.userId);
  }

  public async update(
    session: PrincipalSessionRecord,
    notificationId: string,
    state: unknown,
  ): Promise<void> {
    this.authorization.requireCapability(session, "notifications.read");
    if (state !== "read" && state !== "dismissed") {
      throw new SafeApplicationError("validation_error", "Invalid notification state.", 400);
    }
    try {
      await this.store.updateNotificationState(session.userId, notificationId, state);
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new SafeApplicationError("conflict", error.message, 409);
      }
      throw error;
    }
  }
}
