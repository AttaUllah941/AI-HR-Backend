-- Branch allowed IPs for web clock-in/out restriction
CREATE TABLE "branch_allowed_ips" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "cidr" TEXT NOT NULL,
    "label" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_allowed_ips_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "branch_allowed_ips_branchId_cidr_key" ON "branch_allowed_ips"("branchId", "cidr");
CREATE INDEX "branch_allowed_ips_branchId_idx" ON "branch_allowed_ips"("branchId");

ALTER TABLE "branch_allowed_ips" ADD CONSTRAINT "branch_allowed_ips_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Store client IPs on attendance clock events
ALTER TABLE "attendance_records" ADD COLUMN "checkInIp" TEXT;
ALTER TABLE "attendance_records" ADD COLUMN "checkOutIp" TEXT;
