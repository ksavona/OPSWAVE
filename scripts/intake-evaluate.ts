import { readFile } from "node:fs/promises";

import { extractIntakeSource, OpenAiProvider, type AiDraftTask } from "@opsweave/ai";
import { INTAKE_SCHEMA_VERSION } from "@opsweave/domain";

const [transcriptPath, expectedPath] = process.argv.slice(2);
const apiKey = process.env.OPENAI_API_KEY;
if (transcriptPath === undefined || expectedPath === undefined)
  throw new Error("Usage: pnpm intake:evaluate <transcript.txt> <expected.txt>");
if (apiKey === undefined || apiKey.length === 0) throw new Error("OPENAI_API_KEY is required.");

const [transcript, expectedText] = await Promise.all([
  // Paths are explicit CLI inputs for this owner-run evaluation utility.
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  readFile(transcriptPath, "utf8"),
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  readFile(expectedPath, "utf8"),
]);

interface ExpectedTask {
  due: string;
  note: string;
  owner: string;
  title: string;
}

const expected = expectedText.split("\n").flatMap((line): ExpectedTask[] => {
  const columns = line.replace(/\r$/u, "").split("\t");
  if (!/^\d+$/u.test(columns[0] ?? "") || columns.length < 5) return [];
  return [
    {
      due: columns[3]?.trim() ?? "",
      note: columns.slice(4).join(" ").trim(),
      owner: columns[2]?.trim() ?? "",
      title: columns[1]?.trim() ?? "",
    },
  ];
});

const stopWords = new Set([
  "a",
  "an",
  "and",
  "for",
  "in",
  "of",
  "on",
  "the",
  "to",
  "using",
  "with",
]);
const tokens = (value: string): Set<string> =>
  new Set(
    value
      .toLocaleLowerCase()
      .replaceAll(/[^a-z0-9]+/gu, " ")
      .split(" ")
      .filter((word) => word.length > 1 && !stopWords.has(word)),
  );
const similarity = (left: string, right: string): number => {
  const leftTokens = tokens(left);
  const rightTokens = tokens(right);
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return (2 * intersection) / Math.max(1, leftTokens.size + rightTokens.size);
};

const extractionStartedAt = Date.now();
const result = await extractIntakeSource(
  new OpenAiProvider({ apiKey, model: process.env.OPENAI_DEFAULT_MODEL ?? "gpt-5.6" }),
  {
    content: transcript,
    context: JSON.stringify({
      allowNewProjects: false,
      learning: [],
      ownerIdentity: { fullName: "Kris", knownAs: [], username: "Kris" },
      projects: [],
      selectedProjectIds: [],
      tasks: [],
      workingDays: [],
    }),
    schemaVersion: INTAKE_SCHEMA_VERSION,
  },
  "transcript",
);

const unmatchedActual = new Set(result.draft.tasks.map((_, index) => index));
const unmatchedExpected = new Set(expected.map((_, index) => index));
const pairs = expected
  .flatMap((expectedTask, expectedIndex) =>
    result.draft.tasks.map((actual, actualIndex) => ({
      actualIndex,
      expectedIndex,
      score: similarity(expectedTask.title, actual.title),
    })),
  )
  .filter(({ score }) => score >= 0.3)
  .sort((left, right) => right.score - left.score);
const matches = pairs.flatMap(({ actualIndex, expectedIndex, score }) => {
  if (!unmatchedActual.has(actualIndex) || !unmatchedExpected.has(expectedIndex)) return [];
  const actual = result.draft.tasks.at(actualIndex);
  const expectedTask = expected.at(expectedIndex);
  if (actual === undefined || expectedTask === undefined) return [];
  unmatchedActual.delete(actualIndex);
  unmatchedExpected.delete(expectedIndex);
  return [{ actual, expected: expectedTask, score }];
});

const ownerMatches = matches.filter(({ actual, expected: candidate }) => {
  const actualOwner = actual.assigneeName?.toLocaleLowerCase() ?? "";
  const expectedOwner = candidate.owner.toLocaleLowerCase();
  return (
    actualOwner.length > 0 &&
    (expectedOwner.includes(actualOwner) ||
      actualOwner.includes(expectedOwner.split(" and ")[0] ?? ""))
  );
});
const expectedFixedDate = (value: string): string | null => {
  const match = /(?:^|\s)(\d{1,2})\s+Aug(?:ust)?(?:\b|,)/iu.exec(value);
  return match?.[1] === undefined ? null : `2026-08-${match[1].padStart(2, "0")}`;
};
const fixedDateMatches = matches.filter(({ actual, expected: candidate }) => {
  const date = expectedFixedDate(candidate.due);
  return date !== null && actual.dueDate === date;
});
const expectedWithFixedDate = matches.filter(({ expected: candidate }) =>
  expectedFixedDate(candidate.due),
);

const rejectedStatements = expectedText
  .split("The LLM should not create tasks for the rejected or deferred items:")[1]
  ?.split("\n")
  .map((line) => line.trim())
  .filter((line) => line.length > 0);
const rejectedMatches = (rejectedStatements ?? []).flatMap((statement) =>
  result.draft.tasks
    .filter((candidate) => similarity(statement, candidate.title) >= 0.45)
    .map((candidate) => ({ rejected: statement, title: candidate.title })),
);

const percent = (numerator: number, denominator: number): string =>
  `${String(Math.round((numerator / Math.max(1, denominator)) * 1_000) / 10)}%`;
const taskSummary = (task: AiDraftTask) => ({
  assignee: task.assigneeName,
  dueDate: task.dueDate,
  ownerTask: task.ownerTask,
  title: task.title,
});
const limited = <T>(values: readonly T[], maximum = 25) => ({
  count: values.length,
  sample: values.slice(0, maximum),
});

const missingExpectedTasks = [...unmatchedExpected].flatMap((index) => {
  const candidate = expected.at(index);
  return candidate === undefined ? [] : [candidate.title];
});
const unexpectedTasks = [...unmatchedActual].flatMap((index) => {
  const candidate = result.draft.tasks.at(index);
  return candidate === undefined ? [] : [taskSummary(candidate)];
});

process.stdout.write(
  `${JSON.stringify(
    {
      actualTaskCount: result.draft.tasks.length,
      chunkCount: result.chunkCount,
      dateAccuracyOnMatchedFixedDates: percent(
        fixedDateMatches.length,
        expectedWithFixedDate.length,
      ),
      expectedTaskCount: expected.length,
      extractionDurationSeconds: Math.round((Date.now() - extractionStartedAt) / 100) / 10,
      failedChunkCount: result.failedChunkCount,
      falseRejectedTasks: limited(rejectedMatches),
      matchedTaskCount: matches.length,
      missingExpectedTasks: limited(missingExpectedTasks),
      ownerAccuracyOnMatchedTasks: percent(ownerMatches.length, matches.length),
      ownerTaskCount: result.draft.tasks.filter((task) => task.ownerTask).length,
      precisionEstimate: percent(matches.length, result.draft.tasks.length),
      recallEstimate: percent(matches.length, expected.length),
      thirdPartyTaskCount: result.draft.tasks.filter((task) => !task.ownerTask).length,
      unexpectedTasks: limited(unexpectedTasks),
    },
    null,
    2,
  )}\n`,
);
