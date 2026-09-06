-- CreateTable
CREATE TABLE "company_settings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "emailProvider" TEXT NOT NULL DEFAULT 'console',
    "emailFrom" TEXT,
    "emailSmtpUrl" TEXT,
    "emailApiKeySet" BOOLEAN NOT NULL DEFAULT false,
    "storageProvider" TEXT NOT NULL DEFAULT 'local',
    "storageBucket" TEXT,
    "storageRegion" TEXT,
    "storagePublicBaseUrl" TEXT,
    "integrations" JSONB,
    "system" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_settings_companyId_key" ON "company_settings"("companyId");

-- AddForeignKey
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
