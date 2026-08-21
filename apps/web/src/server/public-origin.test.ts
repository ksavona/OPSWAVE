import { afterEach, describe, expect, it, vi } from "vitest";

import { canonicalPublicOrigin } from "./public-origin";

describe("canonicalPublicOrigin", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses the operator-controlled public tunnel origin", () => {
    vi.stubEnv("APP_BASE_URL", "https://kanban.k-s-e-r-v.work/");
    expect(canonicalPublicOrigin(new Request("http://localhost:3010/api/delegations"))).toBe(
      "https://kanban.k-s-e-r-v.work",
    );
  });

  it("rejects a non-loopback insecure public URL", () => {
    vi.stubEnv("APP_BASE_URL", "http://example.test");
    expect(() => canonicalPublicOrigin(new Request("http://localhost:3010"))).toThrow(
      "must use HTTPS",
    );
  });
});
