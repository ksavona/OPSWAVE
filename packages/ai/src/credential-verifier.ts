export type CredentialVerificationStatus = "invalid" | "rate_limited" | "unavailable" | "verified";

export interface CredentialVerifier {
  verify(credential: string): Promise<CredentialVerificationStatus>;
}

export class DeterministicFakeCredentialVerifier implements CredentialVerifier {
  public verify(credential: string): Promise<CredentialVerificationStatus> {
    if (credential.startsWith("synthetic-valid-")) return Promise.resolve("verified");
    if (credential.startsWith("synthetic-invalid-")) return Promise.resolve("invalid");
    if (credential.startsWith("synthetic-rate-limited-")) return Promise.resolve("rate_limited");
    return Promise.resolve("unavailable");
  }
}
