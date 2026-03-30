import type { EmailProvider, SendEmailInput } from "./provider.types";

class StubEmailProvider implements EmailProvider {
  public readonly name = "stub";

  public async send(input: SendEmailInput): Promise<void> {
    console.info("[welcome-email][stub] send", {
      to: input.to,
      from: input.from,
      subject: input.subject,
      replyTo: input.replyTo,
    });
  }
}

interface GmailConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  senderEmail: string;
}

class GmailSmtpProvider implements EmailProvider {
  public readonly name = "smtp";

  public constructor(private readonly config: GmailConfig) {}

  public async send(input: SendEmailInput): Promise<void> {
    const accessToken = await this.getAccessToken();
    const rawEmail = this.buildRawEmail({
      from: this.config.senderEmail,
      to: input.to,
      subject: input.subject,
      html: input.html,
      replyTo: input.replyTo,
    });

    const response = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          raw: this.toBase64UrlUtf8(rawEmail),
        }),
      },
    );

    const data = (await response.json()) as { error?: unknown };
    if (!response.ok) {
      throw new Error(`Gmail send failed: ${JSON.stringify(data)}`);
    }
  }

  private async getAccessToken(): Promise<string> {
    const body = new URLSearchParams();
    body.set("client_id", this.config.clientId);
    body.set("client_secret", this.config.clientSecret);
    body.set("refresh_token", this.config.refreshToken);
    body.set("grant_type", "refresh_token");

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });
    const data = (await response.json()) as { access_token?: string };

    if (!response.ok || !data.access_token) {
      throw new Error(`Gmail token failed: ${JSON.stringify(data)}`);
    }

    return data.access_token;
  }

  private buildRawEmail(input: {
    from: string;
    to: string;
    subject: string;
    html: string;
    replyTo?: string;
  }): string {
    const boundary = `welcome-${crypto.randomUUID()}`;
    const text = this.toText(input.html);
    const from = this.cleanHeader(input.from);
    const to = this.cleanHeader(input.to);
    const subject = this.cleanHeader(input.subject);
    const replyTo = input.replyTo ? this.cleanHeader(input.replyTo) : null;

    const lines = [
      `From: ${from}`,
      `To: ${to}`,
      ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      text,
      "",
      `--${boundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      input.html,
      "",
      `--${boundary}--`,
    ];

    return lines.join("\r\n");
  }

  private toText(html: string): string {
    return html
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private toBase64UrlUtf8(value: string): string {
    return Buffer.from(value, "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
  }

  private cleanHeader(value: string): string {
    return value.replace(/[\r\n]/g, " ").trim();
  }
}

class UnsupportedProvider implements EmailProvider {
  public constructor(private readonly providerName: string) {}

  public get name(): string {
    return this.providerName;
  }

  public async send(): Promise<void> {
    throw new Error(
      `Email provider '${this.providerName}' is not implemented yet. Use WELCOME_EMAIL_PROVIDER=stub for now.`,
    );
  }
}

export function getEmailProvider(): EmailProvider {
  const provider = (process.env.WELCOME_EMAIL_PROVIDER || "stub").toLowerCase();

  if (provider === "stub") {
    return new StubEmailProvider();
  }

  if (provider === "smtp" || provider === "gmail") {
    const clientId = process.env.GMAIL_CLIENT_ID || "";
    const clientSecret = process.env.GMAIL_CLIENT_SECRET || "";
    const refreshToken = process.env.GMAIL_REFRESH_TOKEN || "";
    const senderEmail = process.env.GMAIL_SENDER_EMAIL || "";

    if (!clientId || !clientSecret || !refreshToken || !senderEmail) {
      throw new Error(
        "Missing Gmail SMTP configuration. Required: GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_SENDER_EMAIL",
      );
    }

    return new GmailSmtpProvider({
      clientId,
      clientSecret,
      refreshToken,
      senderEmail,
    });
  }

  if (provider === "resend") {
    return new UnsupportedProvider(provider);
  }

  console.warn(
    `[welcome-email] Unknown WELCOME_EMAIL_PROVIDER='${provider}', fallback to stub`,
  );
  return new StubEmailProvider();
}
