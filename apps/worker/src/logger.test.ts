import { describe, expect, it } from "vitest";

import { createWorkerLogger } from "./logger.js";

describe("createWorkerLogger", () => {
  it("redacts known credential fields", () => {
    const chunks: string[] = [];
    const logger = createWorkerLogger({
      write(chunk: string) {
        chunks.push(chunk);
      },
    });
    const secret = "synthetic-logger-secret-never-real";

    logger.info({ apiKey: secret, provider: "fake" }, "Provider configuration checked");

    const output = chunks.join("");
    expect(output).toContain("[REDACTED]");
    expect(output).toContain('"provider":"fake"');
    expect(output).not.toContain(secret);
  });
});
