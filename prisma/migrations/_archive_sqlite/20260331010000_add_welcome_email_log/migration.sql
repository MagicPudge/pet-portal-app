-- CreateTable
CREATE TABLE "WelcomeEmailLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "emailNormalized" TEXT NOT NULL,
    "customerId" TEXT,
    "shop" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sentAt" DATETIME,
    "provider" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "WelcomeEmailLog_emailNormalized_key" ON "WelcomeEmailLog"("emailNormalized");