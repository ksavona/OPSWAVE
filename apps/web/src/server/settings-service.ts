import {
  AesGcmCredentialVault,
  CredentialVaultError,
  DeterministicFakeCredentialVerifier,
} from "@opsweave/ai";
import {
  SafeApplicationError,
  calculateWeeklyCapacity,
  generalSettingsSchema,
  prioritizationSettingsSchema,
  workingTimeSettingsSchema,
} from "@opsweave/domain";
import { StoreConflictError, type OpsWeaveStore, type SessionRecord } from "@opsweave/db";

const PROVIDER = "fake";

const configurationError = () =>
  new SafeApplicationError(
    "configuration_error",
    "AI credential protection is unavailable. Configure or restore the master key, then replace the provider credential.",
    503,
  );

const getVault = () => {
  const key = process.env.AI_CREDENTIAL_MASTER_KEY;
  const version = Number(process.env.AI_CREDENTIAL_MASTER_KEY_VERSION ?? "1");
  if (key === undefined || key.length === 0) throw configurationError();
  try {
    return new AesGcmCredentialVault(key, version);
  } catch {
    throw configurationError();
  }
};

export class SettingsService {
  public constructor(private readonly store: OpsWeaveStore) {}

  public async read(session: SessionRecord) {
    const configuration = await this.store.getWorkspaceConfiguration(session.workspaceId);
    const environmentManaged = (process.env.OPENAI_API_KEY?.length ?? 0) > 0;
    const stored = await this.store.credentialStatus(session.workspaceId, PROVIDER);
    return {
      ...configuration,
      ai: environmentManaged
        ? {
            configured: true,
            lastVerifiedAt: null,
            provider: "openai",
            source: "environment" as const,
            verificationStatus: "environment_managed",
          }
        : { ...stored, source: "settings" as const },
    };
  }

  public async updateGeneral(session: SessionRecord, value: unknown) {
    const input = generalSettingsSchema.parse(value);
    try {
      return await this.store.updateGeneral(session.workspaceId, session.ownerId, input);
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new SafeApplicationError("conflict", error.message, 409);
      }
      throw error;
    }
  }

  public async updateWorkingTime(session: SessionRecord, value: unknown) {
    const input = workingTimeSettingsSchema.parse(value);
    const configuration = await this.store.getWorkspaceConfiguration(session.workspaceId);
    const preview = calculateWeeklyCapacity(
      input.days,
      configuration.prioritization.planningBufferPercent,
    );
    try {
      const version = await this.store.updateWorkingTime(
        session.workspaceId,
        session.ownerId,
        input.days,
        input.version,
      );
      return { preview, version };
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new SafeApplicationError("conflict", error.message, 409);
      }
      throw error;
    }
  }

  public async updatePrioritization(session: SessionRecord, value: unknown) {
    const input = prioritizationSettingsSchema.parse(value);
    try {
      return await this.store.updatePrioritization(session.workspaceId, session.ownerId, input);
    } catch (error) {
      if (error instanceof StoreConflictError) {
        throw new SafeApplicationError("conflict", error.message, 409);
      }
      throw error;
    }
  }

  private assertSettingsManaged(): void {
    if ((process.env.OPENAI_API_KEY?.length ?? 0) > 0) {
      throw new SafeApplicationError(
        "conflict",
        "The provider credential is managed by the environment and cannot be changed here.",
        409,
      );
    }
  }

  public async saveCredential(session: SessionRecord, credentialValue: unknown) {
    this.assertSettingsManaged();
    if (
      typeof credentialValue !== "string" ||
      credentialValue.length < 12 ||
      credentialValue.length > 512
    ) {
      throw new SafeApplicationError(
        "validation_error",
        "Enter a provider credential between 12 and 512 characters.",
        400,
      );
    }
    const envelope = getVault().encrypt(credentialValue);
    await this.store.saveCredential({
      envelope,
      ownerId: session.ownerId,
      provider: PROVIDER,
      workspaceId: session.workspaceId,
    });
    return { configured: true, provider: PROVIDER, verificationStatus: "unverified" };
  }

  public async removeCredential(session: SessionRecord) {
    this.assertSettingsManaged();
    await this.store.removeCredential(session.workspaceId, session.ownerId, PROVIDER);
    return { configured: false, provider: PROVIDER };
  }

  public async testCredential(session: SessionRecord) {
    this.assertSettingsManaged();
    const envelope = await this.store.credentialEnvelope(session.workspaceId, PROVIDER);
    if (envelope === null) {
      throw new SafeApplicationError(
        "configuration_error",
        "Configure a provider credential before testing it.",
        400,
      );
    }
    let credential: string;
    try {
      credential = getVault().decrypt(envelope);
    } catch (error) {
      if (error instanceof CredentialVaultError || error instanceof SafeApplicationError) {
        await this.store.recordCredentialVerification(
          session.workspaceId,
          session.ownerId,
          PROVIDER,
          "configuration_error",
        );
        throw configurationError();
      }
      throw error;
    }
    const status = await new DeterministicFakeCredentialVerifier().verify(credential);
    const storedStatus =
      status === "rate_limited" || status === "unavailable" ? "unavailable" : status;
    await this.store.recordCredentialVerification(
      session.workspaceId,
      session.ownerId,
      PROVIDER,
      storedStatus,
    );
    if (status !== "verified") {
      const message =
        status === "invalid"
          ? "The provider rejected the credential."
          : status === "rate_limited"
            ? "The provider test was rate limited. Try again later."
            : "The provider is currently unavailable.";
      throw new SafeApplicationError(
        status === "rate_limited" ? "rate_limited" : "configuration_error",
        message,
        status === "rate_limited" ? 429 : 503,
      );
    }
    return { provider: PROVIDER, status: "verified" };
  }
}
