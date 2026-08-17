import { type OpsWeaveStore, StoreConflictError, type SessionRecord } from "@opsweave/db";
import { describe, expect, it, vi } from "vitest";

import { IntakeService } from "./intake-service";

const session = { ownerId: "owner", workspaceId: "workspace" } as SessionRecord;
const draftId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";

const proposal = {
  questions: [],
  summary: "Synthetic summary",
  tasks: [
    {
      businessValueRationale: null,
      businessValueScore: null,
      confidence: 0.75,
      dueDate: null,
      sourceSpan: "Synthetic source span",
      title: "Synthetic task",
    },
  ],
};

const createStore = () => ({
  approveIntakeDraft: vi.fn(async () => undefined),
  declineIntakeDraft: vi.fn(async () => undefined),
  listFailedIntakeRuns: vi.fn(async () => [
    {
      duplicateOfSourceId: null,
      id: runId,
      safeError: "Safe extraction error.",
      sourceType: "instruction" as const,
    },
  ]),
  listIntakeDrafts: vi.fn(async () => [
    {
      duplicateOfSourceId: null,
      id: draftId,
      proposal,
      purgeAfter: null,
      sourceType: "instruction" as const,
      status: "review_required" as const,
    },
  ]),
  restoreIntakeDraft: vi.fn(async () => undefined),
  retryFallbackIntakeDraft: vi.fn(async () => undefined),
  retryIntakeRun: vi.fn(async () => undefined),
  submitIntakeSource: vi.fn(async () => ({
    duplicateOfSourceId: null,
    id: runId,
    sourceId: "33333333-3333-4333-8333-333333333333",
  })),
});

describe("IntakeService", () => {
  it("validates submissions and schema-validates persisted proposals", async () => {
    const store = createStore();
    const service = new IntakeService(store as unknown as OpsWeaveStore);
    await expect(
      service.submit(session, { content: "  Synthetic intake  ", sourceType: "instruction" }),
    ).resolves.toMatchObject({ id: runId });
    expect(store.submitIntakeSource).toHaveBeenCalledWith("workspace", "owner", {
      content: "Synthetic intake",
      sourceType: "instruction",
    });
    await expect(service.list(session)).resolves.toMatchObject({
      drafts: [{ proposal }],
      failedRuns: [{ id: runId }],
    });
    await expect(
      service.submit(session, { content: "", sourceType: "instruction" }),
    ).rejects.toThrow();
  });

  it("validates identifiers and maps store state conflicts to safe responses", async () => {
    const store = createStore();
    vi.mocked(store.approveIntakeDraft).mockRejectedValueOnce(new StoreConflictError("stale"));
    const service = new IntakeService(store as unknown as OpsWeaveStore);
    await expect(service.approve(session, draftId)).rejects.toMatchObject({
      code: "conflict",
      status: 409,
    });
    await expect(service.decline(session, draftId)).resolves.toBeUndefined();
    await expect(service.restore(session, draftId)).resolves.toBeUndefined();
    await expect(service.retryFallbackDraft(session, draftId)).resolves.toBeUndefined();
    await expect(service.retry(session, runId)).resolves.toBeUndefined();
    await expect(service.retry(session, "not-a-uuid")).rejects.toThrow();
    vi.mocked(store.declineIntakeDraft).mockRejectedValueOnce(new Error("unexpected store error"));
    await expect(service.decline(session, draftId)).rejects.toThrow("unexpected store error");
  });
});
