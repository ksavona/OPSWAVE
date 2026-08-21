import { encryptInvitationPayload } from "@opsweave/domain";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  WebhookEmailTransport,
  configuredEmailTransport,
  processOneEmail,
} from "./email-outbox.ts";

describe("invitation email outbox", () => {
  beforeEach(() => {
    vi.stubEnv("INVITATION_LINK_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
  });

  afterEach(() => vi.unstubAllEnvs());

  it("only configures a webhook transport when an endpoint is present", () => {
    vi.stubEnv("EMAIL_DELIVERY_WEBHOOK_URL", "");
    expect(configuredEmailTransport()).toBeNull();
    vi.stubEnv("EMAIL_DELIVERY_WEBHOOK_URL", "https://email.example.test/deliver");
    vi.stubEnv("EMAIL_DELIVERY_WEBHOOK_TOKEN", "transport-token");
    expect(configuredEmailTransport()).toBeInstanceOf(WebhookEmailTransport);
  });

  it("delivers webhook requests with optional authentication and rejects failures", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 502 }));
    const payload = {
      invitationUrl: "https://example.test/invitations/accept#token=synthetic",
      recipientEmail: "delegate@example.test",
      templateKey: "access_invitation",
    };

    await new WebhookEmailTransport("https://email.example.test/deliver", undefined).deliver(
      payload,
    );
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({ "content-type": "application/json" });
    await expect(
      new WebhookEmailTransport("https://email.example.test/deliver", "transport-token").deliver(
        payload,
      ),
    ).rejects.toThrow("502");
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toEqual({
      authorization: "Bearer transport-token",
      "content-type": "application/json",
    });
  });

  it("returns idle when there is no outbox item", async () => {
    const store = { claimEmailOutbox: vi.fn().mockResolvedValue(null) };
    await expect(processOneEmail(store as never, null, {} as never)).resolves.toBe(false);
  });

  it("rechecks access immediately before delivery and cancels an invalidated item", async () => {
    const encryptedPayload = encryptInvitationPayload(
      JSON.stringify({ invitationUrl: "https://example.test/invitations/accept#token=synthetic" }),
    );
    if (encryptedPayload === null) throw new Error("Expected test encryption.");
    const store = {
      claimEmailOutbox: vi.fn().mockResolvedValue({
        encryptedPayload,
        id: "outbox-id",
        recipientEmail: "delegate@example.test",
        templateKey: "access_invitation",
      }),
      completeEmailOutbox: vi.fn(),
      failEmailOutbox: vi.fn(),
      validateEmailOutboxBeforeSend: vi.fn().mockResolvedValue(false),
    };
    const transport = { deliver: vi.fn() };
    const logger = { info: vi.fn(), warn: vi.fn() };

    await expect(processOneEmail(store as never, transport, logger as never)).resolves.toBe(true);
    expect(store.validateEmailOutboxBeforeSend).toHaveBeenCalledWith("outbox-id");
    expect(transport.deliver).not.toHaveBeenCalled();
    expect(store.completeEmailOutbox).not.toHaveBeenCalled();
    expect(store.failEmailOutbox).not.toHaveBeenCalled();
  });

  it("delivers only the decrypted single-use URL and erases through completion", async () => {
    const invitationUrl = "https://example.test/invitations/accept#token=synthetic";
    const encryptedPayload = encryptInvitationPayload(JSON.stringify({ invitationUrl }));
    if (encryptedPayload === null) throw new Error("Expected test encryption.");
    const store = {
      claimEmailOutbox: vi.fn().mockResolvedValue({
        encryptedPayload,
        id: "outbox-id",
        recipientEmail: "delegate@example.test",
        templateKey: "access_invitation",
      }),
      completeEmailOutbox: vi.fn(),
      failEmailOutbox: vi.fn(),
      validateEmailOutboxBeforeSend: vi.fn().mockResolvedValue(true),
    };
    const transport = { deliver: vi.fn() };
    const logger = { info: vi.fn(), warn: vi.fn() };

    await processOneEmail(store as never, transport, logger as never);

    expect(transport.deliver).toHaveBeenCalledWith({
      invitationUrl,
      recipientEmail: "delegate@example.test",
      templateKey: "access_invitation",
    });
    expect(store.completeEmailOutbox).toHaveBeenCalledWith("outbox-id");
    expect(JSON.stringify(logger.info.mock.calls)).not.toContain(invitationUrl);
  });

  it.each([
    [null, JSON.stringify({ invitationUrl: "https://example.test/invite#token=value" })],
    [{ deliver: vi.fn() }, JSON.stringify({ invitationUrl: "" })],
    [{ deliver: vi.fn() }, JSON.stringify({ unexpected: true })],
  ])("fails safely for an unavailable transport or invalid payload", async (transport, payload) => {
    const encryptedPayload = encryptInvitationPayload(payload);
    if (encryptedPayload === null) throw new Error("Expected test encryption.");
    const store = {
      claimEmailOutbox: vi.fn().mockResolvedValue({
        encryptedPayload,
        id: "outbox-id",
        recipientEmail: "delegate@example.test",
        templateKey: "access_invitation",
      }),
      failEmailOutbox: vi.fn(),
    };
    const logger = { info: vi.fn(), warn: vi.fn() };

    await expect(processOneEmail(store as never, transport, logger as never)).resolves.toBe(true);
    expect(store.failEmailOutbox).toHaveBeenCalledWith(
      "outbox-id",
      "Email delivery was temporarily unavailable.",
    );
    expect(logger.warn).toHaveBeenCalledOnce();
  });
});
