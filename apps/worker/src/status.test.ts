import { describe, expect, it } from "vitest";

import { getWorkerStatus } from "./status.ts";

describe("getWorkerStatus", () => {
  it("makes the non-operational foundation state explicit", () => {
    expect(getWorkerStatus()).toEqual({
      liveJobsEnabled: false,
      provider: "deterministic-fake",
      service: "opsweave-worker",
      state: "foundation-ready",
    });
  });

  it("reports live extraction when a real provider is selected", () => {
    expect(getWorkerStatus("openai")).toEqual({
      liveJobsEnabled: true,
      provider: "openai",
      service: "opsweave-worker",
      state: "operational",
    });
  });
});
