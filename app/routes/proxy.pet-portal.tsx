import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { deletePet, getCustomerId, getShopDomain, getSupabaseConfig, listPets, savePet } from "./pet-portal/data.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  const shopDomain = getShopDomain(request, session?.shop);
  const customerId = getCustomerId(request);

  if (!shopDomain) throw new Response("Missing shop domain in app proxy request.", { status: 400 });

  return Response.json({ ok: true, customerId: customerId ?? null });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  const config = getSupabaseConfig();
  const customerId = getCustomerId(request);
  const shopDomain = getShopDomain(request, session?.shop);

  if (!shopDomain) {
    return Response.json({ ok: false, message: "Missing shop domain in app proxy request." }, { status: 400 });
  }

  if (!customerId) {
    return Response.json({ ok: false, message: "Please sign in to your customer account first." }, { status: 401 });
  }

  const formData = await request.formData();
  const intent = String(formData.get("intent") ?? "");

  if (intent === "list") {
    const pets = await listPets(config, shopDomain, customerId);
    return Response.json({ ok: true, pets });
  }

  if (intent === "delete") {
    const id = String(formData.get("id") ?? "");
    const photoPath = String(formData.get("photoPath") ?? "");
    if (!id) return Response.json({ ok: false, message: "Missing pet id." }, { status: 400 });

    try {
      await deletePet(config, shopDomain, customerId, id, photoPath);
    } catch (error) {
      return Response.json(
        { ok: false, message: error instanceof Error ? error.message : "Failed to delete pet profile." },
        { status: 500 },
      );
    }

    return Response.json({ ok: true, message: "Pet profile removed.", deletedId: id });
  }

  if (intent !== "save") return Response.json({ ok: false, message: "Unsupported action." }, { status: 400 });

  try {
    const { pet, message } = await savePet(config, shopDomain, customerId, formData);
    return Response.json({ ok: true, message, pet });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to save pet profile.";
    const status = msg === "Please enter a pet name." ? 400 : 500;
    return Response.json({ ok: false, message: msg }, { status });
  }
};

export const headers: HeadersFunction = () => {
  return {
    "Content-Security-Policy":
      "frame-ancestors https://*.myshopify.com https://admin.shopify.com https://*.shopifyapps.com https://admin.shop.dev https://admin.myshopify.io https://*.spin.dev",
  };
};
