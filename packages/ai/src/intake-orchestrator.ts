import { createHash } from "node:crypto";

import type {
  AiDraft,
  AiDraftProject,
  AiDraftTask,
  AiExtractionRequest,
  AiExtractionResult,
  AiProvider,
} from "./provider.ts";

const MAX_SOURCE_CHARS_PER_CHUNK = 7_500;
const MAX_PARALLEL_EXTRACTIONS = 4;
const RETRY_SOURCE_CHARS_PER_CHUNK = 3_500;

const sourceLines = (content: string): string[] =>
  content.split("\n").map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));

const isTimestampHeading = (value: string): boolean => {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) return false;
  const parts = trimmed.slice(1, -1).split(":");
  return (
    parts.length === 3 && parts.every((part) => part.length === 2 && Number.isFinite(Number(part)))
  );
};

const meetingCalendarReference = (content: string): string => {
  const dateLine = sourceLines(content).find((line) => line.trim().startsWith("DATE:"));
  const rawDate = dateLine?.slice(dateLine.indexOf(":") + 1).trim();
  if (rawDate === undefined || rawDate.length === 0) return "";
  const meetingDate = new Date(`${rawDate} 00:00:00 UTC`);
  if (!Number.isFinite(meetingDate.getTime())) return "";
  const dates = Array.from({ length: 17 }, (_, offset) => {
    const value = new Date(meetingDate.getTime() + offset * 86_400_000);
    return `${new Intl.DateTimeFormat("en", { weekday: "long", timeZone: "UTC" }).format(value)} ${value.toISOString().slice(0, 10)}`;
  });
  return `MEETING CALENDAR REFERENCE: ${dates.join("; ")}. Resolve relative dates from this calendar and the exact wording in the source.`;
};

const splitOversizedBlock = (block: string, maximum: number): string[] => {
  if (block.length <= maximum) return [block];
  const lines = sourceLines(block).flatMap((line) => {
    if (line.length <= maximum) return [line];
    return Array.from({ length: Math.ceil(line.length / maximum) }, (_, index) =>
      line.slice(index * maximum, (index + 1) * maximum),
    );
  });
  const pieces: string[] = [];
  let current = "";
  for (const line of lines) {
    const next = current.length === 0 ? line : `${current}\n${line}`;
    if (next.length <= maximum) {
      current = next;
      continue;
    }
    if (current.length > 0) pieces.push(current);
    current = line;
  }
  if (current.length > 0) pieces.push(current);
  return pieces;
};

export const splitIntakeSource = (
  content: string,
  sourceType: "instruction" | "meeting_note" | "other_text" | "transcript",
): string[] => {
  if (content.length <= MAX_SOURCE_CHARS_PER_CHUNK) return [content];
  const blocks = content.replaceAll("\r\n", "\n").split("\n\n");
  const firstTimestamp = blocks.findIndex(isTimestampHeading);
  const header =
    sourceType === "transcript" && firstTimestamp > 0
      ? blocks.slice(0, firstTimestamp).join("\n\n").slice(0, 3_000)
      : "";
  const sourceBlocks = (firstTimestamp > 0 ? blocks.slice(firstTimestamp) : blocks).flatMap(
    (block) => splitOversizedBlock(block, MAX_SOURCE_CHARS_PER_CHUNK),
  );
  const bodyChunks: string[] = [];
  let current = "";
  for (const block of sourceBlocks) {
    const next = current.length === 0 ? block : `${current}\n\n${block}`;
    if (next.length <= MAX_SOURCE_CHARS_PER_CHUNK) {
      current = next;
      continue;
    }
    if (current.length > 0) bodyChunks.push(current);
    current = block;
  }
  if (current.length > 0) bodyChunks.push(current);
  return bodyChunks.map(
    (body, index) =>
      `${header.length === 0 ? "" : `${header}\n\n`}SOURCE SEGMENT ${String(index + 1)} OF ${String(bodyChunks.length)}. Extract only actions supported by this segment. Meeting metadata above applies to every segment.\n\n${body}`,
  );
};

const splitFailedChunk = (content: string): string[] => {
  const marker = content.indexOf("SOURCE SEGMENT ");
  const bodyStart = marker < 0 ? -1 : content.indexOf("\n\n", marker);
  const header = bodyStart < 0 ? "" : content.slice(0, marker).trim();
  const body = bodyStart < 0 ? content : content.slice(bodyStart + 2);
  const pieces = splitOversizedBlock(body, RETRY_SOURCE_CHARS_PER_CHUNK);
  return pieces.map(
    (piece, index) =>
      `${header.length === 0 ? "" : `${header}\n\n`}RETRY SUBSEGMENT ${String(index + 1)} OF ${String(pieces.length)}. Extract only actions supported by this subsegment.\n\n${piece}`,
  );
};

const namespaceDraft = (
  draft: AiDraft,
  chunkIndex: number,
  knownProjectRefs = new Set<string>(),
  knownTaskRefs = new Set<string>(),
): AiDraft => {
  const prefix = `chunk-${String(chunkIndex + 1)}-`;
  const taskRefs = new Set(draft.tasks.map((task) => task.clientRef));
  const projectRefs = new Set(draft.projects.map((project) => project.clientRef));
  const projectRef = (value: string): string =>
    knownProjectRefs.has(value) ? value : `${prefix}${value}`.slice(0, 100);
  const taskRef = (value: string): string =>
    knownTaskRefs.has(value) ? value : `${prefix}${value}`.slice(0, 100);
  return {
    ...draft,
    projects: draft.projects.map((project) => ({
      ...project,
      clientRef: projectRef(project.clientRef),
    })),
    tasks: draft.tasks.map((task) => ({
      ...task,
      blockers: task.blockers.map((blocker) => ({
        ...blocker,
        id:
          blocker.type === "proposed_task" && taskRefs.has(blocker.id)
            ? taskRef(blocker.id)
            : blocker.type === "proposed_project" && projectRefs.has(blocker.id)
              ? projectRef(blocker.id)
              : blocker.id,
      })),
      clientRef: taskRef(task.clientRef),
      proposedProjectRef:
        task.proposedProjectRef !== null && projectRefs.has(task.proposedProjectRef)
          ? projectRef(task.proposedProjectRef)
          : task.proposedProjectRef,
    })),
  };
};

const normalizedTitle = (value: string): string =>
  value
    .toLocaleLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, " ")
    .trim();

const combineDrafts = (drafts: readonly AiDraft[], failedChunkCount: number): AiDraft => {
  const projects = new Map<string, AiDraftProject>();
  const tasks = new Map<string, AiDraftTask>();
  const projectRefs = new Map<string, string>();
  const taskRefs = new Map<string, string>();
  const taskKeysByRef = new Map<string, string>();
  for (const draft of drafts) {
    for (const project of draft.projects) {
      const key = normalizedTitle(project.name);
      if (!projects.has(key)) projects.set(key, project);
      const retained = projects.get(key);
      if (retained !== undefined) projectRefs.set(project.clientRef, retained.clientRef);
    }
    for (const task of draft.tasks) {
      const key = normalizedTitle(task.title);
      const previousKey = taskKeysByRef.get(task.clientRef);
      if (previousKey !== undefined && previousKey !== key) tasks.delete(previousKey);
      // A later source segment can correct an earlier assignment, date, or description.
      // Retain its version when both segments use the same normalized outcome title.
      tasks.set(key, task);
      taskKeysByRef.set(task.clientRef, key);
      const retained = tasks.get(key);
      if (retained !== undefined) taskRefs.set(task.clientRef, retained.clientRef);
    }
  }
  const questions = [
    ...new Set([
      ...drafts.flatMap((draft) => draft.questions),
      ...(failedChunkCount === 0
        ? []
        : [
            `${String(failedChunkCount)} source segment${failedChunkCount === 1 ? "" : "s"} could not be extracted. Review the original source before approval.`,
          ]),
    ]),
  ].slice(0, 20);
  return {
    participants: [...new Set(drafts.flatMap((draft) => draft.participants))].slice(0, 100),
    projects: [...projects.values()].slice(0, 25),
    questions,
    summary: drafts
      .map((draft) => draft.summary)
      .filter((summary) => summary.length > 0)
      .join(" ")
      .slice(0, 10_000),
    tasks: [...tasks.values()]
      .map((task) => ({
        ...task,
        blockers: task.blockers.map((blocker) => ({
          ...blocker,
          id:
            blocker.type === "proposed_task"
              ? (taskRefs.get(blocker.id) ?? blocker.id)
              : blocker.type === "proposed_project"
                ? (projectRefs.get(blocker.id) ?? blocker.id)
                : blocker.id,
        })),
        proposedProjectRef:
          task.proposedProjectRef === null
            ? null
            : (projectRefs.get(task.proposedProjectRef) ?? task.proposedProjectRef),
      }))
      .slice(0, 100),
  };
};

const previousActionCandidates = (drafts: readonly { draft: AiDraft; order: number }[]): string => {
  if (drafts.length === 0) return "";
  const tasks = drafts
    .toSorted((left, right) => left.order - right.order)
    .flatMap(({ draft }) => draft.tasks)
    .map((task) => ({
      assigneeName: task.assigneeName,
      clientRef: task.clientRef,
      dueDate: task.dueDate,
      proposedProjectRef: task.proposedProjectRef,
      title: task.title,
    }));
  const projects = drafts
    .toSorted((left, right) => left.order - right.order)
    .flatMap(({ draft }) => draft.projects)
    .map((project) => ({ clientRef: project.clientRef, name: project.name }));
  return `PREVIOUS ACTION CANDIDATES (reference data from earlier source segments):\n${JSON.stringify({ projects, tasks })}`;
};

export interface OrchestratedExtractionResult extends AiExtractionResult {
  readonly chunkCount: number;
  readonly failedChunkCount: number;
}

export const extractIntakeSource = async (
  provider: AiProvider,
  request: AiExtractionRequest,
  sourceType: "instruction" | "meeting_note" | "other_text" | "transcript",
): Promise<OrchestratedExtractionResult> => {
  const chunks = splitIntakeSource(request.content, sourceType);
  const calendarReference = meetingCalendarReference(request.content);
  const contextualRequest =
    calendarReference.length === 0
      ? request
      : {
          ...request,
          context: `${request.context ?? "{}"}\n${calendarReference}`,
        };
  if (chunks.length === 1) {
    const result = await provider.extract(contextualRequest);
    return { ...result, chunkCount: 1, failedChunkCount: 0 };
  }
  const drafts: { draft: AiDraft; order: number }[] = [];
  const failedChunks: { content: string; index: number }[] = [];
  for (let offset = 0; offset < chunks.length; offset += MAX_PARALLEL_EXTRACTIONS) {
    const batch = chunks.slice(offset, offset + MAX_PARALLEL_EXTRACTIONS);
    const earlierCandidates = previousActionCandidates(drafts);
    const knownProjectRefs = new Set(
      drafts.flatMap(({ draft }) => draft.projects.map((p) => p.clientRef)),
    );
    const knownTaskRefs = new Set(
      drafts.flatMap(({ draft }) => draft.tasks.map((task) => task.clientRef)),
    );
    const settled = await Promise.allSettled(
      batch.map((content, batchIndex) =>
        provider.extract({
          ...contextualRequest,
          content,
          context: `${contextualRequest.context ?? "{}"}\n${earlierCandidates}\nSOURCE SEGMENT INDEX: ${String(offset + batchIndex + 1)} OF ${String(chunks.length)}`,
        }),
      ),
    );
    for (const [batchIndex, result] of settled.entries()) {
      if (result.status === "rejected") {
        const content = batch.at(batchIndex);
        if (content !== undefined) failedChunks.push({ content, index: offset + batchIndex });
        continue;
      }
      drafts.push({
        draft: namespaceDraft(
          result.value.draft,
          offset + batchIndex,
          knownProjectRefs,
          knownTaskRefs,
        ),
        order: (offset + batchIndex) * 100,
      });
    }
  }
  let failedChunkCount = 0;
  for (const failed of failedChunks) {
    const retryChunks = splitFailedChunk(failed.content);
    const earlierDrafts = drafts.filter(({ order }) => order < failed.index * 100);
    const earlierCandidates = previousActionCandidates(earlierDrafts);
    const knownProjectRefs = new Set(
      earlierDrafts.flatMap(({ draft }) => draft.projects.map((project) => project.clientRef)),
    );
    const knownTaskRefs = new Set(
      earlierDrafts.flatMap(({ draft }) => draft.tasks.map((task) => task.clientRef)),
    );
    const settled = await Promise.allSettled(
      retryChunks.map((content) =>
        provider.extract({
          ...contextualRequest,
          content,
          context: `${contextualRequest.context ?? "{}"}\n${earlierCandidates}\nRETRY OF SOURCE SEGMENT: ${String(failed.index + 1)} OF ${String(chunks.length)}`,
        }),
      ),
    );
    let retryFailed = false;
    for (const [retryIndex, result] of settled.entries()) {
      if (result.status === "rejected") {
        retryFailed = true;
        continue;
      }
      const namespaceIndex = chunks.length + failed.index * 10 + retryIndex;
      drafts.push({
        draft: namespaceDraft(result.value.draft, namespaceIndex, knownProjectRefs, knownTaskRefs),
        order: failed.index * 100 + retryIndex,
      });
    }
    if (retryFailed) failedChunkCount += 1;
  }
  if (drafts.length === 0) throw new Error("No source segment could be extracted.");
  const draft = combineDrafts(
    drafts.sort((left, right) => left.order - right.order).map(({ draft: value }) => value),
    failedChunkCount,
  );
  const sourceFingerprint = createHash("sha256")
    .update(request.content.trim().replaceAll(/\s+/gu, " "))
    .digest("hex");
  return {
    chunkCount: chunks.length,
    draft,
    failedChunkCount,
    provider: `${provider.name}-chunked`,
    schemaVersion: request.schemaVersion,
    sourceFingerprint,
    summary: draft.summary,
  };
};
