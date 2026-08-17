import type { OpsWeaveStore, SessionRecord } from "@opsweave/db";
import { describe, expect, it, vi } from "vitest";

import { ReportingService } from "./reporting-service";

const session = { workspaceId: "workspace" } as SessionRecord;
const tasks = [
  {
    businessValueScore: 90,
    id: "task",
    title: "=FORMULA()",
    valueSource: "owner",
    workflowLane: "done",
  },
];

describe("ReportingService", () => {
  it("uses authoritative task records for metrics and formula-safe CSV", async () => {
    const store = { listTasks: vi.fn(async () => tasks) };
    const service = new ReportingService(store as unknown as OpsWeaveStore);
    await expect(service.report(session)).resolves.toMatchObject({
      metrics: { completed: 1, taskTotal: 1, valueCoveragePercent: 100 },
    });
    await expect(service.taskCsv(session)).resolves.toContain('"\'=FORMULA()"');
    expect(store.listTasks).toHaveBeenCalledTimes(2);
  });
});
