import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface WelcomeTemplateInput {
  customerName: string;
  shopName: string;
  ctaUrl: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const templatePath = path.resolve(__dirname, "../templates/welcome_letter.html");

let templateCache: string | null = null;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function getTemplate(): Promise<string> {
  if (templateCache) {
    return templateCache;
  }

  templateCache = await readFile(templatePath, "utf8");
  return templateCache;
}

export async function renderWelcomeLetterTemplate(
  input: WelcomeTemplateInput,
): Promise<string> {
  const template = await getTemplate();

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
