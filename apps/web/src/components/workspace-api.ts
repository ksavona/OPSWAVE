export const workspaceRequest = async (url: string, method: string, payload?: unknown) => {
  const response = await fetch(url, {
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    cache: "no-store",
    headers: { "content-type": "application/json" },
    method,
  });
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    const error = new Error(
      typeof body.message === "string" ? body.message : "The request failed.",
    );
    Object.assign(error, { status: response.status });
    throw error;
  }
  return body;
};

export const optionalFormText = (value: FormDataEntryValue | null): string | null =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

export const optionalFormNumber = (value: FormDataEntryValue | null): number | null =>
  typeof value === "string" && value.length > 0 ? Number(value) : null;

const automationReasonLabels = new Map<string, string>([
  ["blocked", "blocked by unfinished dependencies"],
  ["delegated_external_capacity", "assigned to external delegates"],
  ["capacity_or_task_mix", "outside the available capacity or task mix"],
  ["effort_not_set", "without an effort estimate"],
  ["no_remaining_effort", "with no remaining effort"],
  ["no_working_day", "without an available working day"],
  ["not_due_for_daily_focus", "not yet due for daily focus"],
  ["on_hold", "on hold"],
  ["planning_disabled", "excluded from planning"],
  ["requires_breakdown", "requiring breakdown"],
  ["schedule_locked", "protected by a schedule lock"],
  ["stage_not_eligible", "in an ineligible stage"],
  ["start_date_not_arrived", "with a future start date"],
]);

export const automationRunMessage = (
  response: Record<string, unknown>,
  kind: "daily" | "weekly",
): string => {
  const label = kind === "weekly" ? "Weekly" : "Daily";
  const destination = kind === "weekly" ? "This Week" : "Today";
  if (response.result === null || typeof response.result !== "object")
    return `${label} planning completed.`;
  const result = response.result as Record<string, unknown>;
  const selectedCount =
    typeof result.selectedCount === "number" ? Math.max(0, result.selectedCount) : 0;
  const candidateCount =
    typeof result.candidateCount === "number" ? Math.max(0, result.candidateCount) : 0;
  const llmUsed = result.llmUsed === true;
  if (selectedCount > 0)
    return `${label} planning completed. ${String(selectedCount)} task${selectedCount === 1 ? " was" : "s were"} moved to ${destination}. ${llmUsed ? `The LLM ranked ${String(candidateCount)} eligible task${candidateCount === 1 ? "" : "s"}.` : "Deterministic ranking was used."}`;

  const rawReasons =
    result.skippedReasonCounts !== null && typeof result.skippedReasonCounts === "object"
      ? (result.skippedReasonCounts as Record<string, unknown>)
      : {};
  const reasons = Object.entries(rawReasons)
    .flatMap(([reason, count]) =>
      typeof count === "number" && count > 0
        ? [
            {
              count,
              label: automationReasonLabels.get(reason) ?? reason.replaceAll("_", " "),
            },
          ]
        : [],
    )
    .sort((left, right) => right.count - left.count)
    .slice(0, 4)
    .map(({ count, label: reason }) => `${String(count)} ${reason}`)
    .join("; ");
  const planner =
    candidateCount === 0
      ? "The LLM was not called because there were no eligible candidates."
      : llmUsed
        ? `The LLM reviewed ${String(candidateCount)} eligible task${candidateCount === 1 ? "" : "s"}, but none fit the available capacity and task mix.`
        : `Deterministic ranking reviewed ${String(candidateCount)} eligible task${candidateCount === 1 ? "" : "s"}, but none fit the available capacity and task mix.`;
  return `${label} planning completed. No tasks were selected. ${planner}${reasons.length === 0 ? "" : ` Skipped: ${reasons}.`}`;
};
