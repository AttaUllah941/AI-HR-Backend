-- Idempotency-Key support for non-repeatable POSTs (payroll run creation, offer sending).
--
-- A client may send `Idempotency-Key: <opaque string>`; the first request with a key executes and
-- its response is stored here, a retry with the same key and payload replays the stored response
-- instead of executing again (no duplicate payroll runs / duplicate offer emails after a timeout).
--
-- The unique (userId, scope, key) index is what makes concurrent duplicates safe: only one INSERT
-- can win; the loser sees the row and answers 409 (in progress) or replays the stored response.
-- Rows expire after 24 h (expiresAt) and are cleaned up lazily when the same key is seen again.
--
-- Rollback (not run automatically):  DROP TABLE IF EXISTS "idempotency_keys";

CREATE TABLE IF NOT EXISTS "idempotency_keys" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "idempotency_keys_userId_scope_key_key" ON "idempotency_keys"("userId", "scope", "key");

-- Supports a periodic `DELETE ... WHERE "expiresAt" < now()` cleanup job.
CREATE INDEX IF NOT EXISTS "idempotency_keys_expiresAt_idx" ON "idempotency_keys"("expiresAt");
