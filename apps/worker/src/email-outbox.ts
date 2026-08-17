import { decryptInvitationPayload } from "@opsweave/domain";
import type { CollaborationStore } from "@opsweave/db";
import type { Logger } from "pino";

export interface EmailTransport {
  deliver(input: {
    invitationUrl: string;
    recipientEmail: string;
    templateKey: string;
  }): Promise<void>;
}

export class WebhookEmailTransport implements EmailTransport {
  public constructor(
    private readonly endpoint: string,
    private readonly token: string | undefined,
  ) {}

  public async deliver(input: {
    invitationUrl: string;
    recipientEmail: string;
    templateKey: string;
  }): Promise<void> {
    const response = await fetch(this.endpoint, {
      body: JSON.stringify({
        invitationUrl: input.invitationUrl,
        recipientEmail: input.recipientEmail,
        templateKey: input.templateKey,
      }),
      headers: {
        "content-type": "application/json",
        ...(this.token === undefined ? {} : { authorization: `Bearer ${this.token}` }),
      },
      method: "POST",
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Email transport returned ${String(response.status)}.`);
  }
}

export const configuredEmailTransport = (): EmailTransport | null => {
  const endpoint = process.env.EMAIL_DELIVERY_WEBHOOK_URL;
  return endpoint === undefined || endpoint.length === 0
    ? null
    : new WebhookEmailTransport(endpoint, process.env.EMAIL_DELIVERY_WEBHOOK_TOKEN);
};

export const processOneEmail = async (
  store: CollaborationStore,
  transport: EmailTransport | null,
  logger: Logger,
): Promise<boolean> => {
  const outbox = await store.claimEmailOutbox();
  if (outbox === null) return false;
  try {
    if (transport === null) throw new Error("Email delivery transport is not configured.");
    const payload = JSON.parse(decryptInvitationPayload(outbox.encryptedPayload)) as {
      invitationUrl?: unknown;
    };
    if (typeof payload.invitationUrl !== "string" || payload.invitationUrl.length === 0)
      throw new Error("Invitation delivery payload is invalid.");
    if (!(await store.validateEmailOutboxBeforeSend(outbox.id))) return true;
    await transport.deliver({
      invitationUrl: payload.invitationUrl,
      recipientEmail: outbox.recipientEmail,
      templateKey: outbox.templateKey,
    });
    await store.completeEmailOutbox(outbox.id);
    logger.info({ outboxId: outbox.id }, "invitation email delivered");
  } catch (error) {
    await store.failEmailOutbox(outbox.id, "Email delivery was temporarily unavailable.");
    logger.warn({ err: error, outboxId: outbox.id }, "email delivery will be retried safely");
  }
  return true;
};
