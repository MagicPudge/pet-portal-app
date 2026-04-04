export interface SendEmailInput {
  to: string;
  from: string;
  subject: string;
  html: string;
  replyTo?: string;
}

export interface EmailProvider {
  readonly name: string;
  send(input: SendEmailInput): Promise<void>;
}
