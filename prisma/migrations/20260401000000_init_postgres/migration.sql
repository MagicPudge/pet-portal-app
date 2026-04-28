-- CreateEnum
CREATE TYPE "WelcomeEmailStatus" AS ENUM ('SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "PetType" AS ENUM ('dog', 'cat', 'other');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female', 'unknown');

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
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
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WelcomeEmailLog" (
    "id" TEXT NOT NULL,
    "emailNormalized" TEXT NOT NULL,
    "customerId" TEXT,
    "shop" TEXT NOT NULL,
    "status" "WelcomeEmailStatus" NOT NULL,
    "sentAt" TIMESTAMP(3),
    "provider" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WelcomeEmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pet_profiles" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
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
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pet_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WelcomeEmailLog_emailNormalized_key" ON "WelcomeEmailLog"("emailNormalized");

-- CreateIndex
CREATE INDEX "pet_profiles_shop_customer_idx" ON "pet_profiles"("shop_domain", "customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "pet_profiles_shop_customer_pet_name_key" ON "pet_profiles"("shop_domain", "customer_id", "pet_name");
