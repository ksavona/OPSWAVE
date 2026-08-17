import {
  SafeApplicationError,
  hasWorkspaceCapability,
  type Capability,
  type Principal,
} from "@opsweave/domain";
import type {
  AccessDecisionRecord,
  AccessSubjectType,
  CollaborationStore,
  PrincipalSessionRecord,
} from "@opsweave/db";

export const principalFromSession = (session: PrincipalSessionRecord): Principal => ({
  authorizationVersion: session.authorizationVersion,
  email: session.email,
  fullName: session.fullName,
  membershipAuthorizationVersion: session.membershipAuthorizationVersion,
  membershipId: session.membershipId,
  membershipStatus: session.membershipStatus,
  ownerId: session.ownerId,
  role: session.role,
  sessionId: session.id,
  userId: session.userId,
  userStatus: session.userStatus,
  username: session.username,
  workspaceId: session.workspaceId,
});

export class AuthorizationService {
  public constructor(private readonly store: CollaborationStore) {}

  public requireCapability(session: PrincipalSessionRecord, capability: Capability): Principal {
    const principal = principalFromSession(session);
    if (!hasWorkspaceCapability(principal, capability)) {
      throw new SafeApplicationError("forbidden", "You do not have permission to do that.", 403);
    }
    return principal;
  }

  public requireOwnerOrAdmin(session: PrincipalSessionRecord): Principal {
    return this.requireCapability(session, "access.manage");
  }

  public async requireCollaborationEnabled(session: PrincipalSessionRecord): Promise<void> {
    if (session.role === "owner" || session.role === "admin") return;
    if (!(await this.store.isMultiUserEnabled(session.workspaceId))) {
      throw new SafeApplicationError("forbidden", "Collaboration is not enabled.", 403);
    }
  }

  public async requireSubjectAccess(
    session: PrincipalSessionRecord,
    subjectType: AccessSubjectType,
    subjectId: string,
  ): Promise<AccessDecisionRecord | null> {
    if (session.role === "owner" || session.role === "admin") return null;
    await this.requireCollaborationEnabled(session);
    const access = await this.store.resolveAccess(
      session.workspaceId,
      session.userId,
      subjectType,
      subjectId,
    );
    if (access === null) {
      throw new SafeApplicationError("forbidden", "The requested item is unavailable.", 404);
    }
    return access;
  }
}
