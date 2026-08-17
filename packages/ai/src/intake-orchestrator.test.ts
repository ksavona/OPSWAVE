import { describe, expect, it, vi } from "vitest";

import { extractIntakeSource, splitIntakeSource } from "./intake-orchestrator.ts";
import type { AiDraft, AiDraftTask, AiExtractionRequest, AiProvider } from "./provider.ts";

const task = (title: string, clientRef: string): AiDraftTask => ({
  allocatedHours: 1,
  assigneeName: "Kris",
  blockers: [],
  businessValueRationale: "Synthetic operational value.",
  businessValueScore: 70,
  checklist: [],
  clientRef,
  confidence: 0.9,
  definitionOfDone: null,
  dueDate: "2026-08-14",
  endTime: null,
  ownerTask: true,
  origin: "Synthetic test source",
  planningEligible: true,
  planningRationale: "High-value work due soon.",
  priorityLevel: 4,
  projectId: null,
  proposedProjectRef: "programme",
  size: "medium",
  sourceSpan: "Kris will complete this action.",
  startDate: null,
  startTime: null,
  status: "not_started",
  title,
  valueAdd: null,
  workDescription: null,
  workflowLane: "inbox",
});

const draft = (tasks: AiDraftTask[]): AiDraft => ({
  participants: ["Kris", "Daniel"],
  projects: [
    {
      clientRef: "programme",
      description: "Synthetic programme.",
      name: "Operations programme",
      priorityLevel: 4,
    },
  ],
  questions: [],
  summary: "Synthetic source segment extracted.",
  tasks,
});

const longTranscript = () =>
  `MEETING: Operations programme\nDATE: 12 August 2026\nPARTICIPANTS:\n* Kris\n* Daniel\n\n${Array.from(
    { length: 90 },
    (_, index) =>
      `[00:${String(index).padStart(2, "0")}:00]\n\nKris: I will complete synthetic action ${String(index)} by Friday. ${"Context ".repeat(16)}`,
  ).join("\n\n")}`;

describe("splitIntakeSource", () => {
  it("keeps short sources intact and repeats meeting metadata across bounded chunks", () => {
    expect(splitIntakeSource("Short instruction", "instruction")).toEqual(["Short instruction"]);
    const chunks = splitIntakeSource(longTranscript(), "transcript");
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.includes("DATE: 12 August 2026"))).toBe(true);
    expect(chunks[0]).toContain(`SOURCE SEGMENT 1 OF ${String(chunks.length)}`);
    expect(Math.max(...chunks.map((chunk) => chunk.length))).toBeLessThan(11_000);
  });

  it("splits oversized non-transcript lines without requiring timestamp headings", () => {
    const chunks = splitIntakeSource("A".repeat(8_000) + "\n" + "B".repeat(8_000), "other_text");
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length < 7_700)).toBe(true);
  });
});

describe("extractIntakeSource", () => {
  it("uses the direct provider path for a short source", async () => {
    const provider = {
      extract: vi.fn().mockResolvedValue({
        draft: draft([task("Prepare the runbook", "runbook")]),
        provider: "synthetic",
        schemaVersion: "v1",
        sourceFingerprint: "x".repeat(64),
        summary: "Summary",
      }),
      name: "synthetic",
    } satisfies AiProvider;
    await expect(
      extractIntakeSource(
        provider,
        {
          content: "DATE: 12 August 2026\n\nKris will prepare the runbook.",
          schemaVersion: "v1",
        },
        "instruction",
      ),
    ).resolves.toMatchObject({ chunkCount: 1, failedChunkCount: 0, provider: "synthetic" });
    expect(JSON.stringify(provider.extract.mock.calls)).toContain("Wednesday 2026-08-12");
  });

  it("merges chunked drafts, removes duplicates, and rewrites proposed references", async () => {
    let callIndex = 0;
    const provider = {
      extract: vi.fn(async () => {
        const index = callIndex++;
        const unique = {
          ...task(`Unique action ${String(index)}`, "unique"),
          blockers: [
            { id: "shared", type: "proposed_task" as const },
            { id: "programme", type: "proposed_project" as const },
          ],
        };
        const duplicate = task("Shared action", "shared");
        return {
          draft: draft([duplicate, unique]),
          provider: "synthetic",
          schemaVersion: "v1",
          sourceFingerprint: "x".repeat(64),
          summary: "Summary",
        };
      }),
      name: "synthetic",
    } satisfies AiProvider;
    const result = await extractIntakeSource(
      provider,
      { content: longTranscript(), context: "{}", schemaVersion: "v1" },
      "transcript",
    );
    expect(result.chunkCount).toBeGreaterThan(1);
    expect(result.failedChunkCount).toBe(0);
    expect(result.draft.projects).toHaveLength(1);
    expect(
      result.draft.tasks.filter((candidate) => candidate.title === "Shared action"),
    ).toHaveLength(1);
    const retainedProjectRef = result.draft.projects[0]?.clientRef;
    expect(
      result.draft.tasks.every((candidate) => candidate.proposedProjectRef === retainedProjectRef),
    ).toBe(true);
    expect(
      result.draft.tasks
        .filter((candidate) => candidate.title.startsWith("Unique action"))
        .every((candidate) =>
          candidate.blockers.some(
            (blocker) => blocker.type === "proposed_project" && blocker.id === retainedProjectRef,
          ),
        ),
    ).toBe(true);
  });

  it("lets later batches replace earlier actions by their retained client reference", async () => {
    let callIndex = 0;
    const provider = {
      extract: vi.fn(async (request: AiExtractionRequest) => {
        const index = callIndex++;
        const earlierReference = /chunk-1-original/iu.exec(request.context ?? "")?.[0];
        const candidate =
          index === 0
            ? task("Original deployment date", "original")
            : earlierReference === undefined
              ? task(`Unrelated action ${String(index)}`, `action-${String(index)}`)
              : {
                  ...task("Deploy on the corrected date", earlierReference),
                  dueDate: "2026-08-24",
                };
        return {
          draft: draft([candidate]),
          provider: "synthetic",
          schemaVersion: "v1",
          sourceFingerprint: "x".repeat(64),
          summary: "Summary",
        };
      }),
      name: "synthetic",
    } satisfies AiProvider;
    const source = `${longTranscript()}\n\n${longTranscript()}`;
    expect(splitIntakeSource(source, "transcript").length).toBeGreaterThan(4);
    const result = await extractIntakeSource(
      provider,
      { content: source, schemaVersion: "v1" },
      "transcript",
    );
    expect(
      result.draft.tasks.some((candidate) => candidate.title === "Original deployment date"),
    ).toBe(false);
    expect(result.draft.tasks).toContainEqual(
      expect.objectContaining({ dueDate: "2026-08-24", title: "Deploy on the corrected date" }),
    );
    expect(JSON.stringify(provider.extract.mock.calls.at(4))).toContain(
      "PREVIOUS ACTION CANDIDATES",
    );
  });

  it("retries a failed source segment as smaller subsegments", async () => {
    let callIndex = 0;
    const provider = {
      extract: vi.fn(async () => {
        const index = callIndex++;
        if (index === 1) throw new Error("Synthetic segment failure.");
        return {
          draft: draft([task(`Action ${String(index)}`, `action-${String(index)}`)]),
          provider: "synthetic",
          schemaVersion: "v1",
          sourceFingerprint: "x".repeat(64),
          summary: "Summary",
        };
      }),
      name: "synthetic",
    } satisfies AiProvider;
    const result = await extractIntakeSource(
      provider,
      { content: longTranscript(), schemaVersion: "v1" },
      "transcript",
    );
    expect(result.failedChunkCount).toBe(0);
    expect(result.draft.tasks.length).toBeGreaterThan(result.chunkCount - 1);
  });

  it("retains successful chunks and reports a segment whose retries also fail", async () => {
    let callIndex = 0;
    const chunkCount = splitIntakeSource(longTranscript(), "transcript").length;
    const provider = {
      extract: vi.fn(async () => {
        const index = callIndex++;
        if (index === 1 || index >= chunkCount) throw new Error("Synthetic segment failure.");
        return {
          draft: draft([task(`Action ${String(index)}`, `action-${String(index)}`)]),
          provider: "synthetic",
          schemaVersion: "v1",
          sourceFingerprint: "x".repeat(64),
          summary: "Summary",
        };
      }),
      name: "synthetic",
    } satisfies AiProvider;
    const result = await extractIntakeSource(
      provider,
      { content: longTranscript(), schemaVersion: "v1" },
      "transcript",
    );
    expect(result.failedChunkCount).toBe(1);
    expect(result.draft.questions).toContain(
      "1 source segment could not be extracted. Review the original source before approval.",
    );
  });

  it("fails safely when every source segment fails", async () => {
    const provider = {
      extract: vi.fn().mockRejectedValue(new Error("Synthetic outage.")),
      name: "synthetic",
    } satisfies AiProvider;
    await expect(
      extractIntakeSource(
        provider,
        { content: longTranscript(), schemaVersion: "v1" },
        "transcript",
      ),
    ).rejects.toThrow("No source segment could be extracted.");
  });
});
