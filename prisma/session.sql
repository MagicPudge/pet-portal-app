DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'WelcomeEmailStatus'
  ) THEN
    CREATE TYPE "WelcomeEmailStatus" AS ENUM ('SENT', 'FAILED');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'PetType'
  ) THEN
    CREATE TYPE "PetType" AS ENUM ('dog', 'cat', 'other');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'Gender'
  ) THEN
    CREATE TYPE "Gender" AS ENUM ('male', 'female', 'unknown');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "Session" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "shop" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "isOnline" BOOLEAN NOT NULL DEFAULT false,
  "scope" TEXT,
  "expires" TIMESTAMP(3),
  "accessToken" TEXT NOT NULL,
  "userId" BIGINT,
  "firstName" TEXT,
  "lastName" TEXT,
  "email" TEXT,
  "accountOwner" BOOLEAN NOT NULL DEFAULT false,
  "locale" TEXT,
  "collaborator" BOOLEAN DEFAULT false,
  "emailVerified" BOOLEAN DEFAULT false,
  "refreshToken" TEXT,
  "refreshTokenExpires" TIMESTAMP(3)
);

ALTER TABLE "Session"
  ADD COLUMN IF NOT EXISTS "refreshToken" TEXT,
  ADD COLUMN IF NOT EXISTS "refreshTokenExpires" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "accountOwner" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "collaborator" BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS "WelcomeEmailLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "emailNormalized" TEXT NOT NULL,
  "customerId" TEXT,
  "shop" TEXT NOT NULL,
  "status" "WelcomeEmailStatus" NOT NULL,
  "sentAt" TIMESTAMP(3),
  "provider" TEXT NOT NULL,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

ALTER TABLE "WelcomeEmailLog"
  ADD COLUMN IF NOT EXISTS "customerId" TEXT,
  ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "provider" TEXT,
  ADD COLUMN IF NOT EXISTS "errorMessage" TEXT,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "WelcomeEmailLog_emailNormalized_key"
  ON "WelcomeEmailLog" ("emailNormalized");

CREATE TABLE IF NOT EXISTS "pet_profiles" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "shop_domain" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "email" TEXT,
  "first_name" TEXT,
  "last_name" TEXT,
  "pet_name" TEXT NOT NULL,
  "pet_type" "PetType" NOT NULL,
  "breed" TEXT,
  "gender" "Gender" NOT NULL DEFAULT 'unknown',
  "birthday" DATE,
  "adoption_date" DATE,
  "weight_kg" DECIMAL(10,2),
  "photo_path" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "pet_profiles"
  ADD COLUMN IF NOT EXISTS "email" TEXT,
  ADD COLUMN IF NOT EXISTS "first_name" TEXT,
  ADD COLUMN IF NOT EXISTS "last_name" TEXT,
  ADD COLUMN IF NOT EXISTS "breed" TEXT,
  ADD COLUMN IF NOT EXISTS "gender" "Gender" NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS "birthday" DATE,
  ADD COLUMN IF NOT EXISTS "adoption_date" DATE,
  ADD COLUMN IF NOT EXISTS "weight_kg" DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "photo_path" TEXT,
  ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "pet_profiles_shop_customer_idx"
  ON "pet_profiles" ("shop_domain", "customer_id");

CREATE UNIQUE INDEX IF NOT EXISTS "pet_profiles_shop_customer_pet_name_key"
  ON "pet_profiles" ("shop_domain", "customer_id", "pet_name");
