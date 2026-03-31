import { authenticate } from "../../shopify.server";
import { PetPortalDataError, deletePet, getCustomerId, getShopDomain, getSupabaseConfig, listPets, savePet } from "./data.server";

type PetPortalRouteConfig = {
  routeTag: string;
  routePath: string;
  apiPath: string;
};

type PetPortalErrorCode =
  | "AUTH_ERROR"
  | "BAD_REQUEST"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "UNAUTHORIZED_CUSTOMER"
  | "CONFIG_ERROR"
  | "UPSTREAM_ERROR"
  | "INTERNAL_ERROR"
  | string;

const readProxyDebugMeta = (request: Request, routeTag: string) => {
  const url = new URL(request.url);
  const queryKeys = Array.from(url.searchParams.keys());
  return {
    routeTag,
    method: request.method,
    path: url.pathname,
    queryKeys,
    hasSignature: url.searchParams.has("signature"),
    hasHmac: url.searchParams.has("hmac"),
    hasShop: url.searchParams.has("shop"),
    host: request.headers.get("host"),
    xForwardedHost: request.headers.get("x-forwarded-host"),
    xForwardedProto: request.headers.get("x-forwarded-proto"),
    userAgent: request.headers.get("user-agent"),
  };
};

class PetPortalHttpError extends Error {
  status: number;
  code: PetPortalErrorCode;

  constructor(code: PetPortalErrorCode, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

type ActionPayload = {
  formData: FormData;
  intent: "list" | "save" | "delete";
};

const buildHeaders = (routeTag: string, requestId: string, ok: boolean) => ({
  "x-pet-portal-route": routeTag,
  "x-pet-portal-result": ok ? "ok" : "error",
  "x-pet-portal-request-id": requestId,
});

const jsonError = (routeTag: string, requestId: string, status: number, code: PetPortalErrorCode, message: string) =>
  Response.json(
    {
      ok: false,
      code,
      message,
      requestId,
    },
    { status, headers: buildHeaders(routeTag, requestId, false) },
  );

const jsonOk = (routeTag: string, requestId: string, payload: unknown, status = 200) =>
  Response.json(payload, {
    status,
    headers: buildHeaders(routeTag, requestId, true),
  });

const toObject = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PetPortalHttpError("BAD_REQUEST", "JSON payload must be an object.", 400);
  }
  return value as Record<string, unknown>;
};

const normalizeToFormData = (payload: Record<string, unknown>) => {
  const formData = new FormData();
  for (const [key, value] of Object.entries(payload)) {
    if (value == null) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      formData.set(key, String(value));
      continue;
    }
    throw new PetPortalHttpError("BAD_REQUEST", `Unsupported JSON field type for '${key}'.`, 400);
  }
  return formData;
};

const parsePetPortalPayload = async (request: Request): Promise<ActionPayload> => {
  const contentType = (request.headers.get("content-type") || "").toLowerCase();

  if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      throw new PetPortalHttpError("BAD_REQUEST", "Invalid form payload.", 400);
    }
    const intentRaw = String(formData.get("intent") ?? "").trim();
    if (!intentRaw) throw new PetPortalHttpError("BAD_REQUEST", "Missing intent.", 400);
    if (intentRaw !== "list" && intentRaw !== "save" && intentRaw !== "delete") {
      throw new PetPortalHttpError("BAD_REQUEST", "Unsupported action.", 400);
    }
    return { formData, intent: intentRaw };
  }

  if (contentType.includes("application/json")) {
    let parsed: unknown;
    try {
      parsed = await request.json();
    } catch {
      throw new PetPortalHttpError("BAD_REQUEST", "Invalid JSON payload.", 400);
    }

    const body = toObject(parsed);
    const formData = normalizeToFormData(body);
    const intentRaw = String(formData.get("intent") ?? "").trim();
    if (!intentRaw) throw new PetPortalHttpError("BAD_REQUEST", "Missing intent.", 400);
    if (intentRaw !== "list" && intentRaw !== "save" && intentRaw !== "delete") {
      throw new PetPortalHttpError("BAD_REQUEST", "Unsupported action.", 400);
    }
    return { formData, intent: intentRaw };
  }

  throw new PetPortalHttpError(
    "UNSUPPORTED_MEDIA_TYPE",
    "Unsupported content type. Use multipart/form-data, application/x-www-form-urlencoded, or application/json.",
    415,
  );
};

const toHttpError = (error: unknown) => {
  if (error instanceof PetPortalHttpError) return error;
  if (error instanceof PetPortalDataError) {
    return new PetPortalHttpError(error.code, error.message, error.status);
  }
  if (error instanceof Error) {
    if (error.message === "Please enter a pet name.") {
      return new PetPortalHttpError("BAD_REQUEST", error.message, 400);
    }
    return new PetPortalHttpError("UPSTREAM_ERROR", error.message || "Failed to process pet profile request.", 502);
  }
  return new PetPortalHttpError("INTERNAL_ERROR", "Unexpected server error.", 500);
};

export const handlePetPortalLoader = async (request: Request, config: PetPortalRouteConfig) => {
  const requestId = crypto.randomUUID();
  const debugMeta = readProxyDebugMeta(request, config.routeTag);
  console.info("[PetPortal][proxy-loader-request]", { requestId, ...debugMeta });
  try {
    const { session } = await authenticate.public.appProxy(request);
    const shopDomain = getShopDomain(request, session?.shop);
    const customerId = getCustomerId(request);

    if (!shopDomain) {
      throw new PetPortalHttpError("BAD_REQUEST", "Missing shop domain in app proxy request.", 400);
    }

    return jsonOk(config.routeTag, requestId, {
      ok: true,
      route: config.routePath,
      api: config.apiPath,
      customerId: customerId ?? null,
      requestId,
    });
  } catch (error) {
    const resolved =
      error instanceof PetPortalHttpError
        ? error
        : new PetPortalHttpError("AUTH_ERROR", "Failed to validate app proxy request.", 401);
    console.error("[PetPortal][proxy-loader-auth-error]", {
      requestId,
      code: resolved.code,
      status: resolved.status,
      message: resolved.message,
      ...debugMeta,
      error,
    });
    return jsonError(config.routeTag, requestId, resolved.status, resolved.code, resolved.message);
  }
};

export const handlePetPortalAction = async (request: Request, config: PetPortalRouteConfig) => {
  const requestId = crypto.randomUUID();
  const debugMeta = readProxyDebugMeta(request, config.routeTag);
  console.info("[PetPortal][proxy-action-request]", { requestId, ...debugMeta });
  try {
    let sessionShop: string | undefined;
    try {
      const result = await authenticate.public.appProxy(request);
      sessionShop = result.session?.shop;
    } catch {
      throw new PetPortalHttpError("AUTH_ERROR", "Failed to validate app proxy request.", 401);
    }

    const payload = await parsePetPortalPayload(request);
    const shopDomain = getShopDomain(request, sessionShop);
    const customerId = getCustomerId(request, payload.formData);
    const supabaseConfig = getSupabaseConfig();

    if (!shopDomain) {
      throw new PetPortalHttpError("BAD_REQUEST", "Missing shop domain in app proxy request.", 400);
    }
    if (!customerId) {
      throw new PetPortalHttpError("UNAUTHORIZED_CUSTOMER", "Please sign in to your customer account first.", 401);
    }

    if (payload.intent === "list") {
      const pets = await listPets(supabaseConfig, shopDomain, customerId);
      return jsonOk(config.routeTag, requestId, { ok: true, pets, requestId });
    }

    if (payload.intent === "delete") {
      const id = String(payload.formData.get("id") ?? "").trim();
      const photoPath = String(payload.formData.get("photoPath") ?? "").trim();
      if (!id) throw new PetPortalHttpError("BAD_REQUEST", "Missing pet id.", 400);

      await deletePet(supabaseConfig, shopDomain, customerId, id, photoPath);
      return jsonOk(config.routeTag, requestId, { ok: true, message: "Pet profile removed.", deletedId: id, requestId });
    }

    const { pet, message } = await savePet(supabaseConfig, shopDomain, customerId, payload.formData);
    return jsonOk(config.routeTag, requestId, { ok: true, message, pet, requestId });
  } catch (error) {
    const resolved = toHttpError(error);
    console.error("[PetPortal][action-error]", {
      routeTag: config.routeTag,
      requestId,
      code: resolved.code,
      status: resolved.status,
      message: resolved.message,
      ...debugMeta,
      error,
    });
    return jsonError(config.routeTag, requestId, resolved.status, resolved.code, resolved.message);
  }
};

export const petPortalHeaders = () => ({
  "Content-Security-Policy":
    "frame-ancestors https://*.myshopify.com https://admin.shopify.com https://*.shopifyapps.com https://admin.shop.dev https://admin.myshopify.io https://*.spin.dev",
});
