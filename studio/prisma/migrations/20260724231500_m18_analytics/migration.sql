-- M18: the view record behind the analytics dashboard. RecentlyViewed is a per-customer
-- convenience capped at 30 rows; this keeps every view, including the anonymous ones that
-- make up most browsing. visitorId is a truncated salted hash, never an address.
CREATE TABLE "FabricView" (
    "id" TEXT NOT NULL,
    "fabricId" TEXT NOT NULL,
    "colourId" TEXT,
    "userId" TEXT,
    "visitorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FabricView_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FabricView_fabricId_createdAt_idx" ON "FabricView"("fabricId", "createdAt");
CREATE INDEX "FabricView_createdAt_idx" ON "FabricView"("createdAt");
CREATE INDEX "FabricView_colourId_idx" ON "FabricView"("colourId");

ALTER TABLE "FabricView" ADD CONSTRAINT "FabricView_fabricId_fkey" FOREIGN KEY ("fabricId") REFERENCES "Fabric"("id") ON DELETE CASCADE ON UPDATE CASCADE;
