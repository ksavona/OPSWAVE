import { describe, expect, it } from "vitest";

import { DeterministicFakeAiProvider } from "./provider.ts";

describe("DeterministicFakeAiProvider", () => {
  it("returns stable output without external access", async () => {
    const provider = new DeterministicFakeAiProvider();
    const request = {
      content: "  Synthetic   intake content.  ",
      schemaVersion: "foundation-v1",
    };

    const first = await provider.extract(request);
    const second = await provider.extract(request);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      provider: "deterministic-fake",
      schemaVersion: "foundation-v1",
      summary: "Synthetic intake content.",
    });
    expect(first.sourceFingerprint).toHaveLength(64);
  });
});
