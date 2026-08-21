import {
  type OpsWeaveStore,
  StoreConflictError,
  type SessionRecord,
  type StoredCredentialEnvelope,
} from "@opsweave/db";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SettingsService } from "./settings-service";

const session = {
  ownerId: "00000000-0000-4000-8000-000000000001",
  workspaceId: "00000000-0000-4000-8000-000000000002",
} as SessionRecord;

const configuration = {
  general: {
    dateDisplay: "iso" as const,
    defaultKanbanSort: "manual" as const,
    defaultLandingView: "projects" as const,
    displayName: "Synthetic workspace",
    firstDayOfWeek: "monday" as const,
    timezone: "UTC",
    version: 1,
  },
  prioritization: {
    aiTieBreakingEnabled: false,
    allowFinalTaskOverflow: false,
    allowMissingSizeSubstitution: true,
    businessValueInfluenceEnabled: false,
    dailyAutomationEnabled: false,
    dailyBufferEnabled: false,
    dailyLargeQuota: 1,
    dailyMediumQuota: 2,
    dailySmallQuota: 3,
    deadlineRiskHorizonDays: 14,
    manualTodayCarryover: true,
    planningBufferPercent: 10,
    version: 1,
    weeklyAutomationEnabled: false,
  },
  workingDays: [
    { availableHours: 8, enabled: true, weekday: "monday" },
    { availableHours: 8, enabled: true, weekday: "tuesday" },
    { availableHours: 8, enabled: true, weekday: "wednesday" },
    { availableHours: 8, enabled: true, weekday: "thursday" },
    { availableHours: 8, enabled: true, weekday: "friday" },
    { availableHours: 0, enabled: false, weekday: "saturday" },
    { availableHours: 0, enabled: false, weekday: "sunday" },
  ],
};

const harness = () => {
  let envelope: StoredCredentialEnvelope | null = null;
  const store = {
    credentialEnvelope: vi.fn(async () => envelope),
    credentialStatus: vi.fn(async () => ({
      configured: envelope !== null,
      lastVerifiedAt: null,
      provider: "fake",
      updatedAt: null,
      verificationStatus: envelope === null ? "unconfigured" : "unverified",
    })),
    getWorkspaceConfiguration: vi.fn(async () => configuration),
    recordCredentialVerification: vi.fn(async () => undefined),
    removeCredential: vi.fn(async () => {
      envelope = null;
      return true;
    }),
    saveCredential: vi.fn(async (input: { envelope: StoredCredentialEnvelope }) => {
      envelope = input.envelope;
    }),
    updateGeneral: vi.fn(async () => 2),
    updatePrioritization: vi.fn(async () => 2),
    updateWorkingTime: vi.fn(async () => 2),
  };
  return {
    service: new SettingsService(store as unknown as OpsWeaveStore),
    store,
    storedEnvelope: () => envelope,
  };
};

afterEach(() => {
  process.env.OPENAI_API_KEY = "";
  process.env.AI_CREDENTIAL_MASTER_KEY = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
  process.env.AI_CREDENTIAL_MASTER_KEY_VERSION = "1";
});

describe("SettingsService", () => {
  it("returns status only and gives environment-managed credentials precedence", async () => {
    process.env.OPENAI_API_KEY = "synthetic-environment-secret";
    const result = await harness().service.read(session);
    expect(result.ai).toMatchObject({
      configured: true,
      provider: "openai",
      source: "environment",
    });
    expect(JSON.stringify(result)).not.toContain("synthetic-environment-secret");
  });

  it("encrypts, verifies, replaces, and removes a synthetic credential", async () => {
    const { service, store, storedEnvelope } = harness();
    const plaintext = "synthetic-valid-provider-secret";
    await service.saveCredential(session, plaintext);
    expect(JSON.stringify(storedEnvelope())).not.toContain(plaintext);
    await expect(service.testCredential(session)).resolves.toEqual({
      provider: "fake",
      status: "verified",
    });
    expect(store.recordCredentialVerification).toHaveBeenCalledWith(
      session.workspaceId,
      session.ownerId,
      "fake",
      "verified",
    );
    await service.saveCredential(session, "synthetic-invalid-provider-secret");
    await expect(service.testCredential(session)).rejects.toMatchObject({ status: 503 });
    await service.removeCredential(session);
    expect(storedEnvelope()).toBeNull();
  });

  it("fails closed after master-key loss without preventing settings reads", async () => {
    const { service } = harness();
    await service.saveCredential(session, "synthetic-valid-provider-secret");
    process.env.AI_CREDENTIAL_MASTER_KEY = "";
    await expect(service.testCredential(session)).rejects.toMatchObject({
      code: "configuration_error",
      status: 503,
    });
    await expect(service.read(session)).resolves.toMatchObject({ general: configuration.general });
  });

  it("validates inputs and maps stale settings updates to a conflict", async () => {
    const { service, store } = harness();
    await expect(
      service.updateGeneral(session, { ...configuration.general, timezone: "Nope/Zone" }),
    ).rejects.toThrow();
    vi.mocked(store.updateGeneral).mockRejectedValueOnce(new StoreConflictError("stale"));
    await expect(service.updateGeneral(session, configuration.general)).rejects.toMatchObject({
      code: "conflict",
      status: 409,
    });
    await expect(
      service.updateWorkingTime(session, { days: configuration.workingDays, version: 1 }),
    ).resolves.toMatchObject({ preview: { effectiveHours: 36 }, version: 2 });

    vi.mocked(store.updateWorkingTime).mockRejectedValueOnce(new StoreConflictError("stale"));
    await expect(
      service.updateWorkingTime(session, { days: configuration.workingDays, version: 1 }),
    ).rejects.toMatchObject({ code: "conflict", status: 409 });
    await expect(service.updatePrioritization(session, configuration.prioritization)).resolves.toBe(
      2,
    );
    vi.mocked(store.updatePrioritization).mockRejectedValueOnce(new StoreConflictError("stale"));
    await expect(
      service.updatePrioritization(session, configuration.prioritization),
    ).rejects.toMatchObject({ code: "conflict", status: 409 });
  });

  it("rejects mutations when an environment credential has precedence", async () => {
    process.env.OPENAI_API_KEY = "synthetic-environment-secret";
    const { service } = harness();
    await expect(
      service.saveCredential(session, "synthetic-valid-provider-secret"),
    ).rejects.toMatchObject({ code: "conflict", status: 409 });
    await expect(service.removeCredential(session)).rejects.toMatchObject({ status: 409 });
    await expect(service.testCredential(session)).rejects.toMatchObject({ status: 409 });
  });

  it("maps missing, rate-limited, and unavailable fake credentials to safe states", async () => {
    const { service, store } = harness();
    await expect(service.testCredential(session)).rejects.toMatchObject({ status: 400 });
    await service.saveCredential(session, "synthetic-rate-limited-provider-secret");
    await expect(service.testCredential(session)).rejects.toMatchObject({
      code: "rate_limited",
      status: 429,
    });
    await service.saveCredential(session, "synthetic-unavailable-provider-secret");
    await expect(service.testCredential(session)).rejects.toMatchObject({ status: 503 });
    expect(store.recordCredentialVerification).toHaveBeenLastCalledWith(
      session.workspaceId,
      session.ownerId,
      "fake",
      "unavailable",
    );
  });

  it("rejects malformed credential and master-key inputs", async () => {
    const { service } = harness();
    await expect(service.saveCredential(session, "short")).rejects.toMatchObject({ status: 400 });
    process.env.AI_CREDENTIAL_MASTER_KEY = "not-base64-key-material";
    await expect(
      service.saveCredential(session, "synthetic-valid-provider-secret"),
    ).rejects.toMatchObject({ code: "configuration_error", status: 503 });
  });
});
