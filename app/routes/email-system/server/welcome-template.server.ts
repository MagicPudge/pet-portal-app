import welcomeLetterTemplateRaw from "../templates/welcome_letter.html?raw";

interface WelcomeTemplateInput {
  customerName: string;
  shopName: string;
  ctaUrl: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export async function renderWelcomeLetterTemplate(
  input: WelcomeTemplateInput,
): Promise<string> {
  const template = welcomeLetterTemplateRaw;

  const replacements: Record<string, string> = {
    "{{customer_name}}": escapeHtml(input.customerName),
    "{{shop_name}}": escapeHtml(input.shopName),
    "{{cta_url}}": escapeHtml(input.ctaUrl),
  };

  return Object.entries(replacements).reduce(
    (result, [needle, value]) => result.replaceAll(needle, value),
    template,
  );
}
