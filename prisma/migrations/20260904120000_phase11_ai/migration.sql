-- CreateEnum
CREATE TYPE "AiFeature" AS ENUM ('RESUME_SCREENING', 'APPRAISAL', 'HR_ASSISTANT', 'POLICY', 'INSIGHTS', 'RECOMMENDATIONS');
CREATE TYPE "AiRequestStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');
CREATE TYPE "AiMessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateTable
CREATE TABLE "ai_usage_logs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "feature" "AiFeature" NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "status" "AiRequestStatus" NOT NULL DEFAULT 'PENDING',
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "latencyMs" INTEGER,
    "errorMessage" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_conversations" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "AiMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_generations" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT,
    "feature" "AiFeature" NOT NULL,
    "status" "AiRequestStatus" NOT NULL DEFAULT 'SUCCESS',
    "input" JSONB NOT NULL,
    "output" JSONB NOT NULL,
    "relatedEntityType" TEXT,
    "relatedEntityId" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "ai_generations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_usage_logs_companyId_feature_idx" ON "ai_usage_logs"("companyId", "feature");
CREATE INDEX "ai_usage_logs_userId_idx" ON "ai_usage_logs"("userId");
CREATE INDEX "ai_usage_logs_createdAt_idx" ON "ai_usage_logs"("createdAt");

CREATE INDEX "ai_conversations_companyId_userId_idx" ON "ai_conversations"("companyId", "userId");
CREATE INDEX "ai_conversations_deletedAt_idx" ON "ai_conversations"("deletedAt");

CREATE INDEX "ai_messages_conversationId_idx" ON "ai_messages"("conversationId");

CREATE INDEX "ai_generations_companyId_feature_idx" ON "ai_generations"("companyId", "feature");
CREATE INDEX "ai_generations_userId_idx" ON "ai_generations"("userId");
CREATE INDEX "ai_generations_relatedEntityType_relatedEntityId_idx" ON "ai_generations"("relatedEntityType", "relatedEntityId");
CREATE INDEX "ai_generations_deletedAt_idx" ON "ai_generations"("deletedAt");

ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_generations" ADD CONSTRAINT "ai_generations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
