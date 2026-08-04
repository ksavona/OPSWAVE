export interface WorkerStatus {
  readonly liveJobsEnabled: false;
  readonly service: "opsweave-worker";
  readonly state: "foundation-ready";
}

export const getWorkerStatus = (): WorkerStatus => ({
  liveJobsEnabled: false,
  service: "opsweave-worker",
  state: "foundation-ready",
});
