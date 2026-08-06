import { createHash } from "node:crypto";

export interface AiDraftTask {
  readonly businessValueRationale: string | null;
  readonly businessValueScore: number | null;
  readonly confidence: number;
  readonly dueDate: string | null;
  readonly sourceSpan: string | null;
  readonly title: string;
}

export interface AiDraft {
  readonly questions: readonly string[];
  readonly summary: string;
  readonly tasks: readonly AiDraftTask[];
}

export interface AiExtractionRequest {
  readonly content: string;
  readonly schemaVersion: string;
}

export interface AiExtractionResult {
  readonly draft: AiDraft;
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

    const summary = normalizedContent.slice(0, 120);
    return Promise.resolve({
      draft: {
        questions: [],
        summary,
        tasks:
          summary.length === 0
            ? []
            : [
                {
                  businessValueRationale: null,
                  businessValueScore: null,
                  confidence: 0.5,
                  dueDate: null,
                  sourceSpan: summary,
                  title: summary.slice(0, 300),
                },
              ],
      },
      provider: this.name,
      schemaVersion: request.schemaVersion,
      sourceFingerprint,
      summary,
    });
  }
}
