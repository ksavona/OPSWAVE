import { describe, expect, it, vi } from "vitest";

import { processOneComplianceJob } from "./compliance-monitor.ts";

describe("compliance monitor", () => {
  it("stores private model triage and never applies an access action", async () => {
    const job = {
      actorAlias: "Silver Fox",
      actorUserId: "11111111-1111-4111-8111-111111111111",
      auditEventId: "22222222-2222-4222-8222-222222222222",
      content: "Synthetic delegate content",
      contentKind: "message" as const,
      id: "33333333-3333-4333-8333-333333333333",
      neutralSubjectLabel: "Shared task",
      subjectId: "44444444-4444-4444-8444-444444444444",
      subjectType: "task" as const,
      workspaceId: "55555555-5555-4555-8555-555555555555",
    };
    const store = {
      claimComplianceJob: vi.fn().mockResolvedValue(job),
      completeComplianceJob: vi.fn(),
      failComplianceJob: vi.fn(),
    };
    const provider = {
      assessCompliance: vi.fn().mockResolvedValue({
        categories: ["off_platform_solicitation"],
        flagged: true,
        provider: "deterministic-fake",
        reason: "Owner review is appropriate.",
        riskLevel: "medium",
      }),
      extract: vi.fn(),
      name: "deterministic-fake",
    };
    const logger = { info: vi.fn(), warn: vi.fn() };

    await expect(
      processOneComplianceJob(store as never, provider, logger as never, "synthetic-model"),
    ).resolves.toBe(true);
    expect(store.completeComplianceJob).toHaveBeenCalledWith({
      categories: ["off_platform_solicitation"],
      flagged: true,
      job,
      model: "synthetic-model",
      provider: "deterministic-fake",
      reason: "Owner review is appropriate.",
      riskLevel: "medium",
    });
    expect(store.failComplianceJob).not.toHaveBeenCalled();
    expect(Object.keys(store)).not.toContain("reviewComplianceFlag");
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain(job.content);
  });

  it("fails safely for retry when the provider is unavailable", async () => {
    const store = {
      claimComplianceJob: vi.fn().mockResolvedValue({
        content: "Private content",
        contentKind: "message",
        id: "job-id",
        neutralSubjectLabel: "Shared task",
      }),
      completeComplianceJob: vi.fn(),
      failComplianceJob: vi.fn(),
    };
    const logger = { info: vi.fn(), warn: vi.fn() };
    const provider = { extract: vi.fn(), name: "unsupported" };

    await expect(processOneComplianceJob(store as never, provider, logger as never)).resolves.toBe(
      true,
    );
    expect(store.failComplianceJob).toHaveBeenCalledWith(
      "job-id",
      "Compliance review was temporarily unavailable.",
    );
    expect(store.completeComplianceJob).not.toHaveBeenCalled();
  });
});
