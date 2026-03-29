export type SupabaseConfig = {
  url: string;
  serviceRoleKey: string;
  bucket: string;
  schema: string;
};

export type PetType = "dog" | "cat" | "other";
export type Gender = "male" | "female" | "unknown";

export type PetProfile = {
  id: string;
  firstName: string;
  lastName: string;
  petName: string;
  petType: PetType;
  breed: string;
  gender: Gender;
  birthday: string;
  adoptionDate: string;
  weightKg: string;
  photoPath: string;
  photoDataUrl: string;
};

export type PetProfileRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  pet_name: string;
  pet_type: PetType;
  breed: string | null;
  gender: Gender | null;
  birthday: string | null;
  adoption_date: string | null;
  weight_kg: number | null;
  photo_path: string | null;
};

export type ActionResult = {
  ok: boolean;
  message?: string;
  pets?: PetProfile[];
  pet?: PetProfile;
  deletedId?: string;
};
