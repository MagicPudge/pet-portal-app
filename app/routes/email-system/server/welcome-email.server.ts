import { Prisma } from "@prisma/client";
import db from "../../../db.server";
import { getEmailProvider } from "./provider.server";
import { renderWelcomeLetterTemplate } from "./welcome-template.server";

interface CustomerPayload {
  id?: number | string;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}

interface WelcomeEmailInput {
  shop: string;
  customer: CustomerPayload;
}

interface WelcomeEmailLogDelegate {
  create(args: {
    data: {
      emailNormalized: string;
      customerId: string | null;
      shop: string;
      status: "FAILED" | "SENT";
      provider: string;
    };
    select: { id: true };
  }): Promise<{ id: string }>;
  update(args: {
    where: { id: string };
    data: {
      status?: "FAILED" | "SENT";
      sentAt?: Date;
      errorMessage?: string | null;
    };
  }): Promise<unknown>;
}

export type WelcomeEmailResult =
  | { status: "skipped_no_email" }
  | { status: "skipped_duplicate" }
  | { status: "sent"; email: string }
  | { status: "failed"; email: string; error: string };

export function normalizeEmail(email?: string | null): string | null {
  if (!email) {
    return null;
  }

  const normalized = email.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function resolveCustomerName(customer: CustomerPayload): string {
  const first = (customer.first_name || "").trim();
  const last = (customer.last_name || "").trim();
  const fullName = `${first} ${last}`.trim();

  return fullName || "Pet Lover";
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

function getWelcomeEmailLogDelegate(): WelcomeEmailLogDelegate {
  // Keep runtime flexibility in environments where Prisma Client is not regenerated yet.
  return (db as unknown as { welcomeEmailLog: WelcomeEmailLogDelegate })
    .welcomeEmailLog;
}

export async function processCustomerWelcomeEmail(
  input: WelcomeEmailInput,
): Promise<WelcomeEmailResult> {
  const emailNormalized = normalizeEmail(input.customer.email);
  if (!emailNormalized) {
    return { status: "skipped_no_email" };
  }

  const provider = getEmailProvider();
  const from = process.env.WELCOME_EMAIL_FROM || "no-reply@example.com";
  const replyTo = process.env.WELCOME_EMAIL_REPLY_TO || undefined;
  const subject =
    process.env.WELCOME_EMAIL_SUBJECT || "Welcome to the Poppy Pawz Family";
  const ctaUrl = process.env.WELCOME_EMAIL_CTA_URL || "https://www.poppypawz.co.uk/";
  const welcomeEmailLog = getWelcomeEmailLogDelegate();

  let logId: string;
  try {
    const log = await welcomeEmailLog.create({
      data: {
        emailNormalized,
        customerId:
          input.customer.id !== undefined && input.customer.id !== null
            ? String(input.customer.id)
            : null,
        shop: input.shop,
        status: "FAILED",
        provider: provider.name,
      },
      select: {
        id: true,
      },
    });
    logId = log.id;
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return { status: "skipped_duplicate" };
    }

    throw error;
  }

  try {
    const html = await renderWelcomeLetterTemplate({
      customerName: resolveCustomerName(input.customer),
      shopName: input.shop,
      ctaUrl,
    });

    await provider.send({
      to: emailNormalized,
      from,
      subject,
      html,
      replyTo,
    });

    await welcomeEmailLog.update({
      where: { id: logId },
      data: {
        status: "SENT",
        sentAt: new Date(),
        errorMessage: null,
      },
    });

    return { status: "sent", email: emailNormalized };
  } catch (error) {
    const errorMessage = getErrorMessage(error);

    await welcomeEmailLog.update({
      where: { id: logId },
      data: {
        status: "FAILED",
        errorMessage,
      },
    });

    return {
      status: "failed",
      email: emailNormalized,
      error: errorMessage,
    };
  }
}
