-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'PUSH');
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'READ');
CREATE TYPE "NotificationCategory" AS ENUM ('SYSTEM', 'LEAVE', 'ATTENDANCE', 'PAYROLL', 'RECRUITMENT', 'PERFORMANCE', 'AI', 'SECURITY', 'OTHER');
CREATE TYPE "PushPlatform" AS ENUM ('WEB', 'IOS', 'ANDROID');

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "NotificationCategory" NOT NULL DEFAULT 'SYSTEM',
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "subject" TEXT,
    "bodyTemplate" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateId" TEXT,
    "category" "NotificationCategory" NOT NULL DEFAULT 'SYSTEM',
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "readAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "emailTo" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "push_devices" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "PushPlatform" NOT NULL DEFAULT 'WEB',
    "token" TEXT NOT NULL,
    "label" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "push_devices_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "notification_templates_companyId_code_key" ON "notification_templates"("companyId", "code");
CREATE INDEX "notification_templates_category_idx" ON "notification_templates"("category");
CREATE INDEX "notification_templates_deletedAt_idx" ON "notification_templates"("deletedAt");

CREATE INDEX "notifications_companyId_userId_status_idx" ON "notifications"("companyId", "userId", "status");
CREATE INDEX "notifications_userId_createdAt_idx" ON "notifications"("userId", "createdAt");
CREATE INDEX "notifications_category_idx" ON "notifications"("category");
CREATE INDEX "notifications_channel_idx" ON "notifications"("channel");
CREATE INDEX "notifications_deletedAt_idx" ON "notifications"("deletedAt");

CREATE UNIQUE INDEX "notification_preferences_userId_category_key" ON "notification_preferences"("userId", "category");
CREATE INDEX "notification_preferences_companyId_idx" ON "notification_preferences"("companyId");

CREATE UNIQUE INDEX "push_devices_userId_token_key" ON "push_devices"("userId", "token");
CREATE INDEX "push_devices_companyId_userId_idx" ON "push_devices"("companyId", "userId");
CREATE INDEX "push_devices_isActive_idx" ON "push_devices"("isActive");
CREATE INDEX "push_devices_deletedAt_idx" ON "push_devices"("deletedAt");

-- FKs
ALTER TABLE "notification_templates" ADD CONSTRAINT "notification_templates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "notification_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
