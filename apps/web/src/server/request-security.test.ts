import { describe, expect, it } from "vitest";

import {
  SESSION_COOKIE_NAME,
  assertSameOrigin,
  clearSessionCookie,
  createSessionCookie,
  digestRateLimitSignal,
  digestSessionToken,
  getNetworkSignal,
  readCookie,
} from "./request-security";

describe("request security", () => {
  it("creates opaque digests and protected development cookies", () => {
    expect(digestSessionToken("synthetic-token")).toHaveLength(64);
    expect(digestRateLimitSignal("account:owner")).toHaveLength(64);
    const cookie = createSessionCookie("synthetic-token", 60);
    expect(cookie).toContain(`${SESSION_COOKIE_NAME}=synthetic-token`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).not.toContain("Secure");
    expect(clearSessionCookie()).toContain("Max-Age=0");
  });

  it("reads the named cookie without confusing similarly named values", () => {
    const request = new Request("http://localhost:3000", {
      headers: { cookie: `other=x; ${SESSION_COOKIE_NAME}=synthetic%20token` },
    });
    expect(readCookie(request)).toBe("synthetic token");
    expect(readCookie(new Request("http://localhost:3000"))).toBeNull();
  });

  it("accepts same origin and rejects missing or cross-site origins", () => {
    expect(() => {
      assertSameOrigin(
        new Request("http://localhost:3000/api", { headers: { origin: "http://localhost:3000" } }),
      );
    }).not.toThrow();
    expect(() => {
      assertSameOrigin(new Request("http://localhost:3000/api"));
    }).toThrow("origin");
    expect(() => {
      assertSameOrigin(
        new Request("http://localhost:3000/api", { headers: { origin: "not a url" } }),
      );
    }).toThrow("origin");
    expect(() => {
      assertSameOrigin(
        new Request("http://localhost:3000/api", {
          headers: { origin: "https://attacker.invalid" },
        }),
      );
    }).toThrow("origin");
  });

  it("ignores spoofable forwarding headers unless proxy trust is explicit", () => {
    const request = new Request("http://localhost:3000", {
      headers: { "x-forwarded-for": "198.51.100.10" },
    });
    process.env.TRUST_PROXY = "false";
    expect(getNetworkSignal(request)).toBe("direct-client");
    process.env.TRUST_PROXY = "true";
    expect(getNetworkSignal(request)).toBe("198.51.100.10");
    process.env.TRUST_PROXY = "false";
  });
});
