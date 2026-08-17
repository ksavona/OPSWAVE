import {
  DeterministicFakeAiProvider,
  extractIntakeSource,
  writeLearningMemory,
  type AiProvider,
} from "@opsweave/ai";
import { INTAKE_SCHEMA_VERSION, intakeDraftSchema } from "@opsweave/domain";
import type { OpsWeaveStore } from "@opsweave/db";
import type { Logger } from "pino";

const sourceLines = (content: string): string[] =>
  content.split("\n").map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));

const plausiblePersonName = (value: string): string | null => {
  const name = value.trim();
  const words = name.split(" ").filter((word) => word.length > 0);
  if (name.length === 0 || name.length > 200 || words.length > 4) return null;
  return words.every((word) => {
    const first = Array.from(word)[0];
    return first === first?.toLocaleUpperCase() && first !== first?.toLocaleLowerCase();
  })
    ? name
    : null;
};

const participantFromLine = (line: string): string | null => {
  const colonIndex = line.indexOf(":");
  const colonName = colonIndex > 0 ? plausiblePersonName(line.slice(0, colonIndex)) : null;
  if (colonName !== null) return colonName;
  const minutesIndex = line.indexOf(" minutes");
  if (minutesIndex <= 0) return null;
  const beforeMinutes = line.slice(0, minutesIndex).trim();
  const lastSpace = beforeMinutes.lastIndexOf(" ");
  if (lastSpace <= 0 || !Number.isFinite(Number(beforeMinutes.slice(lastSpace + 1)))) return null;
  return plausiblePersonName(beforeMinutes.slice(0, lastSpace));
};

const isTimestamp = (line: string): boolean => {
  const parts = line.split(":");
  return (
    (parts.length === 2 || parts.length === 3) &&
    parts.every((part) => part.length > 0 && part.length <= 2 && Number.isFinite(Number(part)))
  );
};

const transcriptParticipants = (content: string): string[] => [
  ...new Set(
    sourceLines(content)
      .flatMap((line) => participantFromLine(line) ?? [])
      .slice(0, 100),
  ),
];

export const createSafeReviewFallback = (
  content: string,
  sourceType: string,
  selectedProjectIds: readonly string[],
  ownerName: string | null,
) => {
  const sourceSpan =
    sourceLines(content)
      .map((line) => line.trim())
      .find(
        (line) =>
          line.length > 0 &&
          !line.toLocaleLowerCase().startsWith("transcript. use arrow keys to navigate") &&
          !isTimestamp(line),
      )
      ?.slice(0, 2_000) ?? content.trim().slice(0, 2_000);
  return {
    participants: sourceType === "transcript" ? transcriptParticipants(content) : [],
    projects: [],
    questions: [
      "Automatic extraction was unavailable. Review the original source and confirm its action items before approval.",
    ],
    summary:
      "The source was ingested, but automatic extraction was unavailable. A low-confidence review task keeps it actionable without losing the original text.",
    tasks: [
      {
        allocatedHours: 0.5,
        assigneeName: ownerName,
        blockers: [],
        businessValueRationale:
          "Reviewing the source prevents commitments from being lost when automated extraction is unavailable.",
        businessValueScore: 40,
        checklist: [
          "Read the original source",
          "Identify owners and commitments",
          "Create or edit the required tasks",
        ],
        clientRef: "fallback-review-1",
        confidence: 0.1,
        definitionOfDone:
          "All genuine action items in the source have been confirmed in the review board.",
        dueDate: null,
        endTime: null,
        ownerTask: true,
        projectId: selectedProjectIds.length === 1 ? (selectedProjectIds[0] ?? null) : null,
        proposedProjectRef: null,
        size: "small" as const,
        sourceSpan,
        startDate: null,
        startTime: null,
        title: `Review ${sourceType.replaceAll("_", " ")} and confirm action items`.slice(0, 300),
        valueAdd: "Preserves follow-up work when the extraction provider is unavailable.",
        workDescription: "Review the retained source, then correct this draft before approval.",
        workflowLane: "inbox" as const,
      },
    ],
  };
};

const normalizedTaskTitle = (value: string): string =>
  value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, " ")
    .replaceAll(/\s+/gu, " ")
    .trim();

const taskHourLimit = (size: "large" | "medium" | "small" | "mega" | null): number =>
  size === "small" ? 0.5 : size === "medium" ? 1 : 2;

export const splitOversizedDraftTasks = <
  T extends {
    allocatedHours?: number | null;
    blockers?: readonly { id: string; type: string }[];
    clientRef?: string | null;
    size: "large" | "medium" | "small" | "mega" | null;
    title: string;
  },
>(
  tasks: readonly T[],
): T[] =>
  tasks.flatMap((task, taskIndex) => {
    const limit = taskHourLimit(task.size);
    const taskHours = task.allocatedHours;
    if (taskHours == null || taskHours <= limit) return [task];
    const partCount = Math.ceil(taskHours / limit);
    const baseRef = task.clientRef ?? `task-${String(taskIndex + 1)}`;
    return Array.from({ length: partCount }, (_, partIndex) => {
      const allocatedHours = Math.min(limit, taskHours - partIndex * limit);
      return {
        ...task,
        allocatedHours,
        blockers:
          partIndex === 0
            ? (task.blockers ?? [])
            : [{ id: `${baseRef}-part-${String(partIndex)}`, type: "proposed_task" }],
        clientRef: `${baseRef}-part-${String(partIndex + 1)}`,
        title: `${task.title} (part ${String(partIndex + 1)} of ${String(partCount)})`.slice(
          0,
          300,
        ),
      };
    });
  });

/** Processes one durable intake run. Source text remains inside this trusted worker boundary. */
export const processOneIntakeJob = async (
  store: OpsWeaveStore,
  logger: Logger,
  provider: AiProvider = new DeterministicFakeAiProvider(),
): Promise<boolean> => {
  const run = await store.nextQueuedIntakeRun();
  if (run === null) return false;
  try {
    const selectedProjectIds = Array.isArray(run.selectedProjectIds) ? run.selectedProjectIds : [];
    const createNewProjects = run.createNewProjects;
    const workspaceContext = await store.getAiWorkspaceContext(
      run.workspaceId,
      run.content,
      selectedProjectIds,
      createNewProjects,
    );
    let memoryMarkdown = "";
    try {
      memoryMarkdown = await writeLearningMemory(run.workspaceId, workspaceContext.learning);
    } catch (error) {
      logger.warn(
        { errorType: error instanceof Error ? error.name : "unknown", runId: run.id },
        "learning memory markdown could not be refreshed",
      );
    }
    let providerName = provider.name;
    let usedFallback = false;
    let extractedDraft;
    try {
      const relevantTasks =
        selectedProjectIds.length === 0
          ? workspaceContext.tasks.slice(0, 200)
          : workspaceContext.tasks
              .filter(
                (task) => task.projectId !== null && selectedProjectIds.includes(task.projectId),
              )
              .slice(0, 300);
      const result = await extractIntakeSource(
        provider,
        {
          content: run.content,
          context: JSON.stringify({
            ...workspaceContext,
            learning: workspaceContext.learning.slice(0, 20),
            memoryMarkdown,
            tasks: relevantTasks,
          }),
          schemaVersion: INTAKE_SCHEMA_VERSION,
        },
        run.sourceType,
      );
      extractedDraft = result.draft;
      providerName = result.provider;
      if (result.failedChunkCount > 0)
        logger.warn(
          {
            chunkCount: result.chunkCount,
            failedChunkCount: result.failedChunkCount,
            runId: run.id,
          },
          "intake extraction completed with missing source segments",
        );
    } catch (error) {
      usedFallback = true;
      providerName = `${provider.name}-fallback`;
      extractedDraft = createSafeReviewFallback(
        run.content,
        run.sourceType,
        selectedProjectIds,
        workspaceContext.ownerIdentity.fullName ?? workspaceContext.ownerIdentity.username,
      );
      logger.warn(
        { errorType: error instanceof Error ? error.name : "unknown", runId: run.id },
        "intake provider unavailable; safe review fallback created",
      );
    }
    const knownTitles = new Set(
      workspaceContext.tasks.map((task) => normalizedTaskTitle(task.title)),
    );
    const selectedProjectIdSet = new Set(selectedProjectIds);
    const constrainedTasks = extractedDraft.tasks.map((task) => ({
      ...task,
      projectId:
        selectedProjectIdSet.size === 0 ||
        (task.projectId !== null && selectedProjectIdSet.has(task.projectId))
          ? task.projectId
          : null,
      proposedProjectRef: createNewProjects ? task.proposedProjectRef : null,
    }));
    const distinctTasks = splitOversizedDraftTasks(constrainedTasks).filter((task) => {
      if (usedFallback) return true;
      const title = normalizedTaskTitle(task.title);
      if (knownTitles.has(title)) return false;
      knownTitles.add(title);
      return true;
    });
    await store.completeIntakeRun(
      run.id,
      intakeDraftSchema.parse({
        ...extractedDraft,
        ...(selectedProjectIds.length === 0 ? {} : { includedProjectIds: selectedProjectIds }),
        projects: createNewProjects ? extractedDraft.projects : [],
        tasks: distinctTasks.slice(0, 100),
      }),
    );
    logger.info({ provider: providerName, runId: run.id }, "intake extraction completed");
  } catch (error) {
    await store.failIntakeRun(
      run.id,
      "Extraction could not be completed. Retry the intake request.",
    );
    logger.warn(
      { errorType: error instanceof Error ? error.name : "unknown", runId: run.id },
      "intake extraction failed safely",
    );
  }
  return true;
};
