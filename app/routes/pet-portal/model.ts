import type { PetProfile } from "./types";

const createId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `pet-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const createEmptyPet = (): PetProfile => ({
  id: createId(),
  firstName: "",
  lastName: "",
  petName: "",
  petType: "dog",
  breed: "",
  gender: "unknown",
  birthday: "",
  adoptionDate: "",
  weightKg: "",
  photoPath: "",
  photoDataUrl: "",
});
