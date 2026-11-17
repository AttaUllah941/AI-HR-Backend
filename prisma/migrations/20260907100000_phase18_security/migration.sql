-- AlterTable
ALTER TABLE "users" ADD COLUMN "failedLoginCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "lockedUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "company_security_policies" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "maxFailedLogins" INTEGER NOT NULL DEFAULT 5,
    "lockoutMinutes" INTEGER NOT NULL DEFAULT 15,
    "passwordMinLength" INTEGER NOT NULL DEFAULT 8,
    "passwordRequireLetter" BOOLEAN NOT NULL DEFAULT true,
    "passwordRequireNumber" BOOLEAN NOT NULL DEFAULT true,
    "passwordRequireSpecial" BOOLEAN NOT NULL DEFAULT false,
    "requireMfaForPrivileged" BOOLEAN NOT NULL DEFAULT false,
    "allowSelfRegistration" BOOLEAN NOT NULL DEFAULT true,
    "refreshRateLimitPerWindow" INTEGER NOT NULL DEFAULT 60,
    "ipAllowlist" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_security_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "reason" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_security_policies_companyId_key" ON "company_security_policies"("companyId");

-- CreateIndex
CREATE INDEX "login_attempts_companyId_createdAt_idx" ON "login_attempts"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "login_attempts_email_createdAt_idx" ON "login_attempts"("email", "createdAt");

-- CreateIndex
CREATE INDEX "login_attempts_userId_createdAt_idx" ON "login_attempts"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "company_security_policies" ADD CONSTRAINT "company_security_policies_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_attempts" ADD CONSTRAINT "login_attempts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "login_attempts" ADD CONSTRAINT "login_attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
