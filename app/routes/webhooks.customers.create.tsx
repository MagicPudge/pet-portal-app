import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { processCustomerWelcomeEmail } from "./email-system/server/welcome-email.server";

interface CustomerCreatePayload {
  id?: number | string;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, shop, topic } = await authenticate.webhook(request);

  console.log(`[webhook] Received ${topic} for ${shop}`);

  const result = await processCustomerWelcomeEmail({
    shop,
    customer: payload as CustomerCreatePayload,
  });

  if (result.status === "sent") {
    console.info(
      `[welcome-email] sent to ${result.email} from customers/create for ${shop}`,
    );
  } else if (result.status === "skipped_duplicate") {
    console.info(`[welcome-email] skipped duplicate for ${shop}`);
  } else if (result.status === "skipped_no_email") {
    console.info(`[welcome-email] skipped customer without email for ${shop}`);
  } else {
    console.error(
      `[welcome-email] failed for ${result.email} on ${shop}: ${result.error}`,
    );
  }

  return new Response();
};
