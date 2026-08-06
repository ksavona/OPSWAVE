import { describe, expect, it } from "vitest";

import { csvCell, summarizeTasks } from "./reporting.ts";

describe("reporting metrics", () => {
  it("keeps missing value scores separate from their source counts", () => {
    expect(
      summarizeTasks([
        {
          businessValueScore: 80,
          id: "1",
          title: "Owner",
          valueSource: "owner",
          workflowLane: "done",
        },
        {
          businessValueScore: null,
          id: "2",
          title: "Unset",
          valueSource: null,
          workflowLane: "inbox",
        },
      ]),
    ).toMatchObject({
      completed: 1,
      taskTotal: 2,
      valueCoveragePercent: 50,
      valueSourceCounts: { not_set: 1, owner: 1 },
    });
  });

  it("neutralizes spreadsheet formulas in CSV cells", () => {
    expect(csvCell("=SUM(A1:A2)")).toBe('"\'=SUM(A1:A2)"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });
});
