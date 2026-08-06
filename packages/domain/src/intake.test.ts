import { describe, expect, it } from "vitest";

import { intakeDraftSchema, intakeSubmissionSchema } from "./intake.ts";

describe("intake schemas", () => {
  it("accepts a reviewable, provenance-bearing proposed task", () => {
    expect(
      intakeDraftSchema.parse({
        questions: ["Which project owns this?"],
        summary: "Create a migration runbook.",
        tasks: [
          {
            businessValueRationale: null,
            businessValueScore: null,
            confidence: 0.8,
            dueDate: null,
            sourceSpan: "Create a migration runbook.",
            title: "Create a migration runbook",
          },
        ],
      }),
    ).toMatchObject({ tasks: [{ confidence: 0.8 }] });
  });

  it("rejects empty source content and invalid confidence", () => {
    expect(() =>
      intakeSubmissionSchema.parse({ content: " ", sourceType: "instruction" }),
    ).toThrow();
    expect(() =>
      intakeDraftSchema.parse({
        questions: [],
        summary: "x",
        tasks: [
          {
            businessValueRationale: null,
            businessValueScore: null,
            confidence: 2,
            dueDate: null,
            sourceSpan: null,
            title: "x",
          },
        ],
      }),
    ).toThrow();
  });
});
