import type { PetProfile, PetProfileRow, SupabaseConfig } from "./types";

export class PetPortalDataError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

let cachedSupabaseConfig: SupabaseConfig | null = null;

export const getSupabaseConfig = (): SupabaseConfig => {
  if (cachedSupabaseConfig) return cachedSupabaseConfig;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseBucket = process.env.SUPABASE_BUCKET;
  const schema = process.env.SUPABASE_SCHEMA || "public";

  if (!supabaseUrl || !supabaseServiceRoleKey || !supabaseBucket) {
    throw new PetPortalDataError(
      "CONFIG_ERROR",
      "Missing required Supabase env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_BUCKET",
      500,
    );
  }

  cachedSupabaseConfig = {
    url: supabaseUrl,
    serviceRoleKey: supabaseServiceRoleKey,
    bucket: supabaseBucket,
    schema,
  };
  return cachedSupabaseConfig;
};

const readSupabaseErrorMessage = async (response: Response, fallback: string) => {
  const body = await response.text().catch(() => "");
  if (!body) return fallback;

  try {
    const parsed = JSON.parse(body) as { message?: string; error?: string; hint?: string; details?: string };
    return parsed.message || parsed.error || parsed.details || parsed.hint || fallback;
  } catch {
    return body.slice(0, 300) || fallback;
  }
};

const classifySupabaseStatus = (response: Response, detail: string, fallbackStatus: number) => {
  const msg = detail.toLowerCase();
  if (
    response.status === 401 ||
    response.status === 403 ||
    msg.includes("row-level security") ||
    msg.includes("permission denied") ||
    msg.includes("forbidden")
  ) {
    return 403;
  }
  if (response.status === 404 || msg.includes("not found")) return 404;
  if (response.status >= 500) return 502;
  return fallbackStatus;
};

const throwSupabaseError = async (
  response: Response,
  fallbackMessage: string,
  code: string,
  fallbackStatus: number = 502,
) => {
  const detail = await readSupabaseErrorMessage(response, fallbackMessage);
  const status = classifySupabaseStatus(response, detail, fallbackStatus);
  throw new PetPortalDataError(code, detail, status);
};

export const getCustomerId = (request: Request, formData?: FormData | null) => {
  const requestUrl = new URL(request.url);
  const customerId = requestUrl.searchParams.get("logged_in_customer_id") || requestUrl.searchParams.get("customer_id");
  if (customerId) return customerId;

  const bodyHint = formData ? String(formData.get("customer_id_hint") ?? "").trim() : "";
  if (bodyHint) return bodyHint;

  // Dev fallback: allows local testing without storefront login.
  const queryHint = requestUrl.searchParams.get("pet_portal_customer_id");
  if (queryHint) return queryHint;
  if (process.env.PET_PORTAL_DEV_CUSTOMER_ID) return process.env.PET_PORTAL_DEV_CUSTOMER_ID;

  return process.env.NODE_ENV !== "production" ? null : null;
};

export const getShopDomain = (request: Request, sessionShop?: string) => {
  if (sessionShop) return sessionShop;
  const requestUrl = new URL(request.url);
  return requestUrl.searchParams.get("shop");
};

const supabaseHeaders = (serviceRoleKey: string) => ({
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
});

const buildPathCandidates = (path: string, bucket: string) => {
  const trimmed = String(path || "").trim().replace(/^\/+/, "");
  if (!trimmed) return [] as string[];

  const candidates: string[] = [trimmed];
  if (trimmed.startsWith(`${bucket}/`)) {
    const stripped = trimmed.slice(bucket.length + 1);
    if (stripped) candidates.push(stripped);
  }
  return Array.from(new Set(candidates));
};

const arePathsEquivalent = (a: string, b: string, bucket: string) => {
  const setA = new Set(buildPathCandidates(a, bucket));
  const setB = new Set(buildPathCandidates(b, bucket));
  for (const item of setA) {
    if (setB.has(item)) return true;
  }
  return false;
};

const encodeStoragePath = (path: string) =>
  path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

const buildPublicPhotoUrl = (supabaseUrl: string, supabaseBucket: string, path: string) => {
  const candidates = buildPathCandidates(path, supabaseBucket);
  if (!candidates.length) return "";
  return `${supabaseUrl}/storage/v1/object/public/${supabaseBucket}/${encodeStoragePath(candidates[0])}`;
};

const toAbsoluteStorageUrl = (supabaseUrl: string, value: string) => {
  if (/^https?:\/\//i.test(value)) return value;
  const normalized = value.startsWith("/") ? value : `/${value}`;
  if (normalized.startsWith("/storage/v1/")) {
    return `${supabaseUrl}${normalized}`;
  }
  if (normalized.startsWith("/object/")) {
    return `${supabaseUrl}/storage/v1${normalized}`;
  }
  return `${supabaseUrl}${normalized}`;
};

const createSignedPhotoUrl = async (config: SupabaseConfig, path: string) => {
  const candidates = buildPathCandidates(path, config.bucket);
  if (!candidates.length) return null;

  type SignedUrlBody = { signedURL?: string; signedUrl?: string };

  for (const candidate of candidates) {
    const response = await fetch(
      `${config.url}/storage/v1/object/sign/${config.bucket}/${encodeStoragePath(candidate)}`,
      {
        method: "POST",
        headers: {
          ...supabaseHeaders(config.serviceRoleKey),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ expiresIn: 60 * 60 * 24 * 7 }),
      },
    );
    if (!response.ok) continue;

    const payload = (await response.json().catch(() => ({}))) as SignedUrlBody;
    const signed = payload.signedURL || payload.signedUrl;
    if (signed) return toAbsoluteStorageUrl(config.url, signed);
  }

  console.warn("[PetPortal][photo-sign-url-failed]", {
    bucket: config.bucket,
    path,
    candidates,
  });
  return null;
};

const mapRowToPet = (row: PetProfileRow, photoDataUrl: string): PetProfile => ({
  id: row.id,
  firstName: row.first_name ?? "",
  lastName: row.last_name ?? "",
  petName: row.pet_name,
  petType: row.pet_type,
  breed: row.breed ?? "",
  gender: row.gender ?? "unknown",
  birthday: row.birthday ?? "",
  adoptionDate: row.adoption_date ?? "",
  weightKg: row.weight_kg == null ? "" : String(row.weight_kg),
  photoPath: row.photo_path ?? "",
  photoDataUrl,
});

const sanitizePathSegment = (value: string) => value.replace(/[^a-zA-Z0-9._-]/g, "-");

const getFileExtension = (fileName: string) => {
  const trimmed = fileName.trim();
  const lastDot = trimmed.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === trimmed.length - 1) return "";
  return trimmed.slice(lastDot + 1).toLowerCase();
};

const normalizeImageExtension = (extension: string) => {
  const ext = extension.trim().toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "jpg";
  if (ext === "png") return "png";
  if (ext === "gif") return "gif";
  if (ext === "webp") return "webp";
  return "";
};

const inferExtensionFromMime = (mimeType: string) => {
  const mime = mimeType.trim().toLowerCase();
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/gif") return "gif";
  if (mime === "image/webp") return "webp";
  return "";
};

const resolveAllowedImageExtension = (fileNameHint: string, mimeTypeHint: string) => {
  const fromName = normalizeImageExtension(getFileExtension(fileNameHint));
  if (fromName) return fromName;
  const fromMime = inferExtensionFromMime(mimeTypeHint);
  if (fromMime) return fromMime;
  throw new PetPortalDataError("BAD_PHOTO_FORMAT", "Only .jpg, .jpeg, .png, .gif, and .webp image formats are allowed.", 400);
};

const maxPhotoBytes = 900 * 1024;

const createStoragePath = (shopDomain: string, customerId: string, petName: string, extension: string) => {
  const safeShopDomain = sanitizePathSegment(shopDomain);
  const safeCustomerId = sanitizePathSegment(customerId);
  const safePetName = sanitizePathSegment(petName) || "pet";
  return `${safeShopDomain}/${safeCustomerId}/${safePetName}.${extension}`;
};

const uploadPhotoObject = async (
  config: SupabaseConfig,
  nextPhotoPath: string,
  body: Uint8Array,
  contentType: string,
) => {
  const uploadResponse = await fetch(`${config.url}/storage/v1/object/${config.bucket}/${encodeStoragePath(nextPhotoPath)}`, {
    method: "POST",
    headers: {
      ...supabaseHeaders(config.serviceRoleKey),
      "Content-Type": contentType || "application/octet-stream",
      "x-upsert": "true",
    },
    body: Buffer.from(body),
  });
  if (!uploadResponse.ok) {
    await throwSupabaseError(uploadResponse, "Failed to upload photo.", "PHOTO_UPLOAD_FAILED");
  }
};

const readPhotoBase64Payload = (formData: FormData) => {
  const raw = String(formData.get("photoBase64") ?? "").trim();
  if (!raw) return null;

  const mimeTypeHint = String(formData.get("photoMimeType") ?? "").trim() || "application/octet-stream";
  const fileNameHint = String(formData.get("photoFileName") ?? "").trim() || "photo.jpg";
  const commaIndex = raw.indexOf(",");
  const base64Body = commaIndex >= 0 ? raw.slice(commaIndex + 1) : raw;
  const body = new Uint8Array(Buffer.from(base64Body, "base64"));
  if (!body.byteLength) {
    throw new PetPortalDataError("BAD_PHOTO_PAYLOAD", "Photo payload is empty.", 400);
  }
  if (body.byteLength >= maxPhotoBytes) {
    throw new PetPortalDataError("PHOTO_TOO_LARGE", "Photo size must be smaller than 900KB.", 400);
  }
  return { body, mimeTypeHint, fileNameHint };
};

const ensureUniquePetName = async (
  config: SupabaseConfig,
  shopDomain: string,
  customerId: string,
  petName: string,
  currentId?: string,
) => {
  const query = new URLSearchParams({
    select: "id",
    shop_domain: `eq.${shopDomain}`,
    customer_id: `eq.${customerId}`,
    pet_name: `eq.${petName}`,
  });
  const response = await fetch(`${config.url}/rest/v1/pet_profiles?${query.toString()}`, {
    headers: {
      ...supabaseHeaders(config.serviceRoleKey),
      "Accept-Profile": config.schema,
    },
  });
  if (!response.ok) {
    await throwSupabaseError(response, "Failed to validate pet name uniqueness.", "PET_NAME_CHECK_FAILED");
  }

  const rows = (await response.json()) as Array<{ id: string }>;
  const exists = rows.some((row) => row.id && row.id !== currentId);
  if (exists) {
    throw new PetPortalDataError(
      "DUPLICATE_PET_NAME",
      "A pet with the same name already exists for this account. Please use a different pet name.",
      400,
    );
  }
};

export const listPets = async (config: SupabaseConfig, shopDomain: string, customerId: string) => {
  const query = new URLSearchParams({
    select: "id,first_name,last_name,pet_name,pet_type,breed,gender,birthday,adoption_date,weight_kg,photo_path",
    shop_domain: `eq.${shopDomain}`,
    customer_id: `eq.${customerId}`,
    order: "created_at.asc",
  });

  const response = await fetch(`${config.url}/rest/v1/pet_profiles?${query.toString()}`, {
    headers: {
      ...supabaseHeaders(config.serviceRoleKey),
      "Accept-Profile": config.schema,
    },
  });
  if (!response.ok) {
    await throwSupabaseError(response, "Failed to load pet profiles.", "LIST_PETS_FAILED");
  }

  const rows = (await response.json()) as PetProfileRow[];
  const pets = await Promise.all(
    rows.map(async (row) => {
      const photoDataUrl = row.photo_path
        ? (await createSignedPhotoUrl(config, row.photo_path)) || buildPublicPhotoUrl(config.url, config.bucket, row.photo_path)
        : "";
      return mapRowToPet(row, photoDataUrl);
    }),
  );
  return pets;
};

export const deletePet = async (
  config: SupabaseConfig,
  shopDomain: string,
  customerId: string,
  id: string,
  photoPath?: string,
) => {
  const response = await fetch(
    `${config.url}/rest/v1/pet_profiles?id=eq.${id}&customer_id=eq.${customerId}&shop_domain=eq.${shopDomain}`,
    {
      method: "DELETE",
      headers: {
        ...supabaseHeaders(config.serviceRoleKey),
        "Content-Profile": config.schema,
      },
    },
  );
  if (!response.ok) {
    await throwSupabaseError(response, "Failed to delete pet profile.", "DELETE_PET_FAILED");
  }

  const candidates = buildPathCandidates(photoPath || "", config.bucket);
  for (const candidate of candidates) {
    await fetch(`${config.url}/storage/v1/object/${config.bucket}/${encodeStoragePath(candidate)}`, {
      method: "DELETE",
      headers: supabaseHeaders(config.serviceRoleKey),
    }).catch(() => undefined);
  }
};

export const savePet = async (
  config: SupabaseConfig,
  shopDomain: string,
  customerId: string,
  formData: FormData,
) => {
  const mode = String(formData.get("mode") ?? "create");
  const id = String(formData.get("id") ?? "");
  const petName = String(formData.get("petName") ?? "").trim();
  if (!petName) throw new Error("Please enter a pet name.");
  await ensureUniquePetName(config, shopDomain, customerId, petName, mode === "edit" ? id : undefined);

  const previousPhotoPath = String(formData.get("photoPath") ?? "").trim().replace(/^\/+/, "");
  let photoPath = previousPhotoPath;
  const photoSelected = String(formData.get("photo_selected") ?? "").trim() === "1";
  const photoFile = formData.get("photo");
  const base64Payload = readPhotoBase64Payload(formData);

  if (photoFile instanceof File && photoFile.size > 0) {
    if (photoFile.size >= maxPhotoBytes) {
      throw new PetPortalDataError("PHOTO_TOO_LARGE", "Photo size must be smaller than 900KB.", 400);
    }
    const extension = resolveAllowedImageExtension(photoFile.name || "", photoFile.type || "");
    const nextPhotoPath = createStoragePath(shopDomain, customerId, petName, extension);
    await uploadPhotoObject(
      config,
      nextPhotoPath,
      new Uint8Array(await photoFile.arrayBuffer()),
      photoFile.type || "application/octet-stream",
    );
    photoPath = nextPhotoPath;
  } else if (base64Payload) {
    const extension = resolveAllowedImageExtension(base64Payload.fileNameHint, base64Payload.mimeTypeHint);
    const nextPhotoPath = createStoragePath(shopDomain, customerId, petName, extension);
    await uploadPhotoObject(config, nextPhotoPath, base64Payload.body, base64Payload.mimeTypeHint);
    photoPath = nextPhotoPath;
  } else if (photoSelected) {
    throw new PetPortalDataError("PHOTO_UPLOAD_MISSING", "Photo upload payload is missing. Please retry.", 400);
  }

  const payload = {
    shop_domain: shopDomain,
    customer_id: customerId,
    first_name: String(formData.get("firstName") ?? "") || null,
    last_name: String(formData.get("lastName") ?? "") || null,
    pet_name: petName,
    pet_type: String(formData.get("petType") ?? "dog"),
    breed: String(formData.get("breed") ?? "") || null,
    gender: String(formData.get("gender") ?? "unknown"),
    birthday: String(formData.get("birthday") ?? "") || null,
    adoption_date: String(formData.get("adoptionDate") ?? "") || null,
    weight_kg: String(formData.get("weightKg") ?? "") ? Number(String(formData.get("weightKg"))) : null,
    photo_path: photoPath || null,
  };

  const response = await fetch(
    mode === "create"
      ? `${config.url}/rest/v1/pet_profiles`
      : `${config.url}/rest/v1/pet_profiles?id=eq.${id}&customer_id=eq.${customerId}&shop_domain=eq.${shopDomain}`,
    {
      method: mode === "create" ? "POST" : "PATCH",
      headers: {
        ...supabaseHeaders(config.serviceRoleKey),
        "Content-Type": "application/json",
        "Content-Profile": config.schema,
        Prefer: "return=representation",
      },
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    const fallback = mode === "create" ? "Failed to create pet profile." : "Failed to update pet profile.";
    await throwSupabaseError(response, fallback, mode === "create" ? "CREATE_PET_FAILED" : "UPDATE_PET_FAILED");
  }

  const rows = (await response.json()) as PetProfileRow[];
  const saved = rows[0];
  if (!saved) throw new PetPortalDataError("SAVE_PET_EMPTY_RESULT", "Failed to save pet profile.", 502);
  if (previousPhotoPath && photoPath && !arePathsEquivalent(previousPhotoPath, photoPath, config.bucket)) {
    const candidates = buildPathCandidates(previousPhotoPath, config.bucket);
    const activeCandidates = new Set(buildPathCandidates(photoPath, config.bucket));
    for (const candidate of candidates) {
      if (activeCandidates.has(candidate)) continue;
      await fetch(`${config.url}/storage/v1/object/${config.bucket}/${encodeStoragePath(candidate)}`, {
        method: "DELETE",
        headers: supabaseHeaders(config.serviceRoleKey),
      }).catch(() => undefined);
    }
  }
  const photoDataUrl = saved.photo_path
    ? (await createSignedPhotoUrl(config, saved.photo_path)) || buildPublicPhotoUrl(config.url, config.bucket, saved.photo_path)
    : "";

  return {
    pet: mapRowToPet(saved, photoDataUrl),
    message: mode === "create" ? "New pet profile added." : "Pet profile updated.",
  };
};
