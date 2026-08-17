import { describe, expect, it } from "vitest";

import {
  attachmentSharingSchema,
  delegationCreateSchema,
  delegationUpdateSchema,
  hasWorkspaceCapability,
  isGrantActive,
  normalizeEmail,
  taskDelegateSharingSchema,
  type Principal,
} from "./access.ts";

const principal = (overrides: Partial<Principal> = {}): Principal => ({
  authorizationVersion: 1,
  email: "owner@example.test",
  fullName: "Owner",
  membershipAuthorizationVersion: 1,
  membershipId: "membership",
  membershipStatus: "active",
  ownerId: "owner",
  role: "owner",
  sessionId: "session",
  userId: "user",
  userStatus: "active",
  username: "owner",
  workspaceId: "workspace",
  ...overrides,
});

describe("multi-user access rules", () => {
  it("normalizes invited email addresses", () => {
    expect(normalizeEmail("  TeSt@Example.COM ")).toBe("test@example.com");
  });

  it("keeps privileged capabilities owner/admin-only", () => {
    expect(hasWorkspaceCapability(principal(), "settings.manage")).toBe(true);
    expect(
      hasWorkspaceCapability(principal({ role: "admin", ownerId: null }), "users.manage"),
    ).toBe(true);
    expect(
      hasWorkspaceCapability(principal({ role: "delegate", ownerId: null }), "settings.manage"),
    ).toBe(false);
  });

  it("denies every capability to inactive principals", () => {
    expect(
      hasWorkspaceCapability(principal({ membershipStatus: "deactivated" }), "task.read"),
    ).toBe(false);
    expect(hasWorkspaceCapability(principal({ userStatus: "archived" }), "task.read")).toBe(false);
    expect(hasWorkspaceCapability(principal({ authorizationVersion: 0 }), "task.read")).toBe(false);
    expect(
      hasWorkspaceCapability(principal({ membershipAuthorizationVersion: 0 }), "task.read"),
    ).toBe(false);
    expect(
      hasWorkspaceCapability(principal({ role: "delegate", ownerId: null }), "task.read"),
    ).toBe(true);
  });

  it("requires project scope for project collaborators", () => {
    expect(
      delegationCreateSchema.safeParse({
        accessRole: "project_collaborator",
        delegateEmail: "delegate@example.test",
        subjectId: "fc7d9f6e-4973-49b0-b621-e26215b44d98",
        subjectType: "task",
      }).success,
    ).toBe(false);
    expect(
      delegationCreateSchema.safeParse({
        accessRole: "project_collaborator",
        delegateEmail: "delegate@example.test",
        subjectId: "fc7d9f6e-4973-49b0-b621-e26215b44d98",
        subjectType: "project",
      }).success,
    ).toBe(true);
    expect(
      delegationCreateSchema.safeParse({
        accessRole: "contributor",
        delegateEmail: "delegate@example.test",
        expiresAt: new Date(0).toISOString(),
        subjectId: "fc7d9f6e-4973-49b0-b621-e26215b44d98",
        subjectType: "task",
      }).success,
    ).toBe(false);
    expect(
      delegationCreateSchema.safeParse({
        accessRole: "reviewer",
        delegateEmail: "delegate@example.test",
        expiresAt: "2099-01-01T00:00:00.000Z",
        subjectId: "fc7d9f6e-4973-49b0-b621-e26215b44d98",
        subjectType: "task",
      }).success,
    ).toBe(true);
  });

  it("requires meaningful, future-dated delegation updates", () => {
    expect(delegationUpdateSchema.safeParse({ version: 1 }).success).toBe(false);
    expect(
      delegationUpdateSchema.safeParse({ expiresAt: new Date(0).toISOString(), version: 1 })
        .success,
    ).toBe(false);
    expect(delegationUpdateSchema.safeParse({ expiresAt: null, version: 1 }).success).toBe(true);
    expect(
      delegationUpdateSchema.safeParse({
        delegateEmail: "replacement@example.test",
        expiresAt: "2099-01-01T00:00:00.000Z",
        version: 2,
      }).success,
    ).toBe(true);
  });

  it("requires recipients for selected-only task and attachment sharing", () => {
    expect(
      taskDelegateSharingSchema.safeParse({
        selectedUserIds: [],
        visibility: "selected_delegates",
      }).success,
    ).toBe(false);
    expect(taskDelegateSharingSchema.safeParse({ visibility: "project_delegates" }).success).toBe(
      true,
    );
    expect(
      attachmentSharingSchema.safeParse({
        approvalStatus: "approved",
        selectedUserIds: [],
        visibility: "shared_selected_delegates",
      }).success,
    ).toBe(false);
    expect(
      attachmentSharingSchema.safeParse({
        approvalStatus: "draft",
        visibility: "internal_only",
      }).success,
    ).toBe(true);
  });

  it("treats expiry as an immediate access boundary", () => {
    expect(isGrantActive({ expiresAt: null, status: "active" })).toBe(true);
    expect(isGrantActive({ expiresAt: new Date(0), status: "active" })).toBe(false);
    expect(isGrantActive({ expiresAt: null, status: "revoked" })).toBe(false);
  });
});
