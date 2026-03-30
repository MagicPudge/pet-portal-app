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

  if (provider === "resend" || provider === "smtp") {
    return new UnsupportedProvider(provider);
  }

  console.warn(
    `[welcome-email] Unknown WELCOME_EMAIL_PROVIDER='${provider}', fallback to stub`,
  );
  return new StubEmailProvider();
}
