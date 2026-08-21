import { describe, expect, it, vi } from "vitest";

import {
  createSafeReviewFallback,
  processOneIntakeJob,
  splitOversizedDraftTasks,
} from "./intake-job.ts";

describe("processOneIntakeJob", () => {
  it("builds review fallbacks from common transcript formats and retained project context", () => {
    const projectId = "11111111-1111-4111-8111-111111111111";
    expect(
      createSafeReviewFallback(
        "Transcript. Use arrow keys to navigate.\r\n0:16\r\nAlexandra: I will review this.\r\nBrian Vassallo 1 minutes 8 seconds\r\nlowercase speaker: ignored",
        "transcript",
        [projectId],
        "Alexandra Simões",
      ),
    ).toMatchObject({
      participants: ["Alexandra", "Brian Vassallo"],
      tasks: [
        {
          assigneeName: "Alexandra Simões",
          projectId,
          sourceSpan: "Alexandra: I will review this.",
        },
      ],
    });
  });

  it("uses the bounded original text when no non-timestamp source line is available", () => {
    expect(createSafeReviewFallback("0:16", "instruction", [], null)).toMatchObject({
      participants: [],
      tasks: [{ assigneeName: null, projectId: null, sourceSpan: "0:16" }],
    });
    expect(
      createSafeReviewFallback(
        "One Two Three Four Five 2 minutes 0 seconds",
        "transcript",
        ["one", "two"],
        null,
      ).participants,
    ).toEqual([]);
  });
  it("splits AI work at the size-specific duration limits", () => {
    const tasks = splitOversizedDraftTasks([
      {
        allocatedHours: 5,
        blockers: [],
        clientRef: "large-work",
        size: "large" as const,
        title: "Complete the migration",
      },
      {
        allocatedHours: 1.25,
        blockers: [],
        clientRef: "small-work",
        size: "small" as const,
        title: "Verify each record",
      },
      {
        allocatedHours: 3,
        blockers: [],
        clientRef: "medium-work",
        size: "medium" as const,
        title: "Review the changes",
      },
      {
        allocatedHours: 5,
        blockers: [],
        clientRef: "unclassified-work",
        size: null,
        title: "Document the result",
      },
    ]);
    expect(tasks.map((task) => task.allocatedHours)).toEqual([
      2, 2, 1, 0.5, 0.5, 0.25, 1, 1, 1, 2, 2, 1,
    ]);
    expect(tasks[1]?.blockers).toEqual([{ id: "large-work-part-1", type: "proposed_task" }]);
    expect(tasks[4]?.blockers).toEqual([{ id: "small-work-part-1", type: "proposed_task" }]);
  });
  it("stores a schema-validated draft without logging source text", async () => {
    const sourceText = "Synthetic private meeting note";
    const store = {
      completeIntakeRun: vi.fn(),
      getAiWorkspaceContext: vi.fn().mockResolvedValue({
        learning: [],
        ownerIdentity: { fullName: "Alexandra Simões", knownAs: ["Alex"], username: "alex" },
        projects: [],
        tasks: [],
      }),
      nextQueuedIntakeRun: vi.fn().mockResolvedValue({
        content: sourceText,
        id: "run-1",
        sourceId: "source-1",
        sourceType: "meeting_note",
        status: "processing",
        workspaceId: "00000000-0000-4000-8000-000000000001",
      }),
    };
    const logger = { info: vi.fn(), warn: vi.fn() };
    const provider = {
      extract: vi.fn().mockResolvedValue({
        draft: { questions: [], summary: "Summary", tasks: [] },
        provider: "test",
        schemaVersion: "2026-08-06",
        sourceFingerprint: "x".repeat(64),
      }),
      name: "test",
    };

    expect(await processOneIntakeJob(store as never, logger as never, provider)).toBe(true);
    expect(store.completeIntakeRun).toHaveBeenCalledWith("run-1", {
      participants: [],
      projects: [],
      questions: [],
      summary: "Summary",
      tasks: [],
    });
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain(sourceText);
  });

  it("returns false when the durable queue is empty", async () => {
    const store = { nextQueuedIntakeRun: vi.fn().mockResolvedValue(null) };
    expect(await processOneIntakeJob(store as never, {} as never)).toBe(false);
  });

  it("removes exact current-work and within-draft duplicates before review", async () => {
    const store = {
      completeIntakeRun: vi.fn(),
      getAiWorkspaceContext: vi.fn().mockResolvedValue({
        learning: [],
        ownerIdentity: { fullName: null, knownAs: [], username: "synthetic-owner" },
        projects: [],
        tasks: [{ title: "Existing task" }],
      }),
      nextQueuedIntakeRun: vi.fn().mockResolvedValue({
        content: "Existing and new work",
        id: "run-deduplicate",
        sourceId: "source-deduplicate",
        sourceType: "instruction",
        status: "processing",
        workspaceId: "00000000-0000-4000-8000-000000000003",
      }),
    };
    const draftTask = (title: string) => ({
      businessValueRationale: null,
      businessValueScore: null,
      confidence: 0.8,
      dueDate: null,
      sourceSpan: null,
      title,
    });
    const provider = {
      extract: vi.fn().mockResolvedValue({
        draft: {
          projects: [],
          questions: [],
          summary: "Summary",
          tasks: [draftTask("Existing task!"), draftTask("New task"), draftTask("New task")],
        },
        provider: "test",
      }),
      name: "test",
    };

    expect(
      await processOneIntakeJob(
        store as never,
        { info: vi.fn(), warn: vi.fn() } as never,
        provider,
      ),
    ).toBe(true);
    expect(store.completeIntakeRun).toHaveBeenCalledWith(
      "run-deduplicate",
      expect.objectContaining({ tasks: [expect.objectContaining({ title: "New task" })] }),
    );
  });

  it("creates a bounded review fallback while keeping source text out of logs", async () => {
    const sourceText =
      "Transcript. Use arrow keys to navigate.\nAlexandra Simões 0 minutes 16 seconds\nBrian Vassallo 1 minutes 8 seconds\nSynthetic confidential source that must not be logged";
    const failure = new Error(`provider failed while handling ${sourceText}`);
    const store = {
      completeIntakeRun: vi.fn(),
      failIntakeRun: vi.fn(),
      getAiWorkspaceContext: vi.fn().mockResolvedValue({
        learning: [],
        ownerIdentity: { fullName: "Alexandra Simões", knownAs: ["Alex"], username: "alex" },
        projects: [],
        tasks: [],
      }),
      nextQueuedIntakeRun: vi.fn().mockResolvedValue({
        content: sourceText,
        id: "run-2",
        sourceId: "source-2",
        sourceType: "transcript",
        status: "processing",
        workspaceId: "00000000-0000-4000-8000-000000000002",
      }),
    };
    const logger = { info: vi.fn(), warn: vi.fn() };
    const provider = { extract: vi.fn().mockRejectedValue(failure), name: "test" };
    expect(await processOneIntakeJob(store as never, logger as never, provider)).toBe(true);
    expect(store.completeIntakeRun).toHaveBeenCalledWith(
      "run-2",
      expect.objectContaining({
        participants: ["Alexandra Simões", "Brian Vassallo"],
        tasks: [
          expect.objectContaining({
            confidence: 0.1,
            ownerTask: true,
            title: "Review transcript and confirm action items",
          }),
        ],
      }),
    );
    expect(store.failIntakeRun).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      { errorType: "Error", runId: "run-2" },
      "intake provider unavailable; safe review fallback created",
    );
    expect(JSON.stringify(store.failIntakeRun.mock.calls)).not.toContain(sourceText);
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(sourceText);
  });
});
