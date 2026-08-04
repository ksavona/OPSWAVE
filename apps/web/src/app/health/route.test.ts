import { describe, expect, it } from "vitest";

import { GET } from "./route";

describe("GET /health", () => {
  it("returns a minimal non-sensitive health response", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      service: "opsweave-web",
      status: "ok",
      version: "0.0.0",
    });
  });
});
