export interface WorkerStatus {
  readonly liveJobsEnabled: boolean;
  readonly provider: string;
  readonly service: "opsweave-worker";
  readonly state: "foundation-ready" | "operational";
}

export const getWorkerStatus = (provider = "deterministic-fake"): WorkerStatus => ({
  liveJobsEnabled: provider !== "deterministic-fake",
  provider,
  service: "opsweave-worker",
  state: provider === "deterministic-fake" ? "foundation-ready" : "operational",
});
