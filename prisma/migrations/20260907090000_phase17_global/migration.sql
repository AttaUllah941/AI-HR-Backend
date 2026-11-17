-- CreateTable
CREATE TABLE "search_bookmarks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT NOT NULL DEFAULT '',
    "query" TEXT,
    "icon" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "search_bookmarks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recent_searches" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "filters" JSONB,
    "resultCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recent_searches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "search_bookmarks_userId_createdAt_idx" ON "search_bookmarks"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "search_bookmarks_userId_route_entityId_key" ON "search_bookmarks"("userId", "route", "entityId");

-- CreateIndex
CREATE INDEX "recent_searches_userId_createdAt_idx" ON "recent_searches"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "search_bookmarks" ADD CONSTRAINT "search_bookmarks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recent_searches" ADD CONSTRAINT "recent_searches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
