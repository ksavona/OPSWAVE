import { describe, expect, it, vi } from "vitest";

import { processOneIntakeJob } from "./intake-job.ts";

describe("processOneIntakeJob", () => {
  it("stores a schema-validated draft without logging source text", async () => {
    const sourceText = "Synthetic private meeting note";
    const store = {
      completeIntakeRun: vi.fn(),
      nextQueuedIntakeRun: vi.fn().mockResolvedValue({
        content: sourceText,
        id: "run-1",
        sourceId: "source-1",
        sourceType: "meeting_note",
        status: "processing",
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
      questions: [],
      summary: "Summary",
      tasks: [],
    });
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain(sourceText);
  });
});
