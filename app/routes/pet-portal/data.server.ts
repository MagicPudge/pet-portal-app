import type { PetProfile, PetProfileRow, SupabaseConfig } from "./types";

export const getSupabaseConfig = (): SupabaseConfig => {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseBucket = process.env.SUPABASE_BUCKET;
  const schema =
    process.env.SUPABASE_SCHEMA ||
    process.env.VITE_SUPABASE_SCHEMA ||
    (process.env.NODE_ENV === "production" ? "public" : "develop");

  if (!supabaseUrl || !supabaseServiceRoleKey || !supabaseBucket) {
    throw new Response(
      "Missing required Supabase env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_BUCKET",
      { status: 500 },
    );
  }

  return {
    url: supabaseUrl,
    serviceRoleKey: supabaseServiceRoleKey,
    bucket: supabaseBucket,
    schema,
  };
};

export const getCustomerId = (request: Request) => {
  const requestUrl = new URL(request.url);
  return requestUrl.searchParams.get("logged_in_customer_id") || requestUrl.searchParams.get("customer_id");
};

export const getShopDomain = (request: Request, sessionShop?: string) => {
  if (sessionShop) return sessionShop;
  const requestUrl = new URL(request.url);
  return requestUrl.searchParams.get("shop");
};

const supabaseHeaders = (supabaseServiceRoleKey: string) => ({
  apikey: supabaseServiceRoleKey,
  Authorization: `Bearer ${supabaseServiceRoleKey}`,
});

const encodeStoragePath = (path: string) =>
  path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

const buildPhotoUrl = (supabaseUrl: string, supabaseBucket: string, path: string) =>
  `${supabaseUrl}/storage/v1/object/public/${supabaseBucket}/${encodeStoragePath(path)}`;

const mapRowToPet = (supabaseUrl: string, supabaseBucket: string, row: PetProfileRow): PetProfile => {
  return {
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
    photoDataUrl: row.photo_path ? buildPhotoUrl(supabaseUrl, supabaseBucket, row.photo_path) : "",
  };
};

const createStoragePath = (shopDomain: string, fileName: string) =>
  `${shopDomain}/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, "-")}`;

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
  if (!response.ok) throw new Error("Failed to load pet profiles.");

  const rows = (await response.json()) as PetProfileRow[];
  return rows.map((row) => mapRowToPet(config.url, config.bucket, row));
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
  if (!response.ok) throw new Error("Failed to delete pet profile.");

  if (photoPath) {
    await fetch(`${config.url}/storage/v1/object/${config.bucket}/${encodeStoragePath(photoPath)}`, {
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

  let photoPath = String(formData.get("photoPath") ?? "");
  let uploadWarning = "";
  const photoFile = formData.get("photo");
  if (photoFile instanceof File && photoFile.size > 0) {
    const nextPhotoPath = createStoragePath(shopDomain, photoFile.name);
    const uploadResponse = await fetch(
      `${config.url}/storage/v1/object/${config.bucket}/${encodeStoragePath(nextPhotoPath)}`,
      {
        method: "POST",
        headers: {
          ...supabaseHeaders(config.serviceRoleKey),
          "Content-Type": photoFile.type || "application/octet-stream",
          "x-upsert": "true",
        },
        body: Buffer.from(await photoFile.arrayBuffer()),
      },
    );
    if (uploadResponse.ok) {
      photoPath = nextPhotoPath;
    } else {
      const bodyText = await uploadResponse.text();
      uploadWarning = bodyText.includes("row-level security")
        ? "Pet details were saved, but photo upload is blocked by the current Supabase storage policy."
        : "Pet details were saved, but photo upload failed.";
    }
  }

  const payload = {
    shop_domain: shopDomain,
    customer_id: customerId,
    consent: true,
    page_url: String(formData.get("pageUrl") ?? "") || null,
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
    photo_mime: photoFile instanceof File && photoFile.size > 0 ? photoFile.type || null : null,
    photo_size: photoFile instanceof File && photoFile.size > 0 ? String(photoFile.size) : null,
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
    throw new Error(mode === "create" ? "Failed to create pet profile." : "Failed to update pet profile.");
  }

  const rows = (await response.json()) as PetProfileRow[];
  const saved = rows[0];
  if (!saved) throw new Error("Failed to save pet profile.");

  return {
    pet: mapRowToPet(config.url, config.bucket, saved),
    message: uploadWarning || (mode === "create" ? "New pet profile added." : "Pet profile updated."),
  };
};
