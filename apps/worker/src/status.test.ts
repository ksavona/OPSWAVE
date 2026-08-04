import { describe, expect, it } from "vitest";

import { getWorkerStatus } from "./status.ts";

describe("getWorkerStatus", () => {
  it("makes the non-operational foundation state explicit", () => {
    expect(getWorkerStatus()).toEqual({
      liveJobsEnabled: false,
      service: "opsweave-worker",
      state: "foundation-ready",
    });
  });
});
