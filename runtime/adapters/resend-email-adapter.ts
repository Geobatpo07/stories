import type { EmailMessage, EmailPort } from "../ports/types";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * Sends through Resend's plain HTTP API — deliberately not the `resend` npm
 * package, since the whole SDK is a thin wrapper over one JSON POST and this
 * project keeps dependencies to what earns its place (see build/README.md,
 * runtime/README.md for the same philosophy elsewhere). Takes its API key
 * and sender address as constructor arguments, not `process.env` directly:
 * `EnvironmentConfiguration` is the only file in `runtime/` allowed to touch
 * `process.env` — see environment-configuration.ts.
 */
export class ResendEmailAdapter implements EmailPort {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const response = await this.fetchImpl(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Resend rejected the email (${response.status}): ${body}`);
    }
  }
}
