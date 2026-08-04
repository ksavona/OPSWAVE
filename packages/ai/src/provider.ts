import { createHash } from "node:crypto";

export interface AiExtractionRequest {
  readonly content: string;
  readonly schemaVersion: string;
}

export interface AiExtractionResult {
  readonly provider: string;
  readonly schemaVersion: string;
  readonly sourceFingerprint: string;
  readonly summary: string;
}

export interface AiProvider {
  readonly name: string;
  extract(request: AiExtractionRequest): Promise<AiExtractionResult>;
}

export class DeterministicFakeAiProvider implements AiProvider {
  public readonly name = "deterministic-fake";

  public async extract(request: AiExtractionRequest): Promise<AiExtractionResult> {
    const normalizedContent = request.content.trim().replaceAll(/\s+/gu, " ");
    const sourceFingerprint = createHash("sha256").update(normalizedContent).digest("hex");

    return Promise.resolve({
      provider: this.name,
      schemaVersion: request.schemaVersion,
      sourceFingerprint,
      summary: normalizedContent.slice(0, 120),
    });
  }
}
