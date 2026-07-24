-- M17: shareable catalogue links for a collection.
-- Only the SHA-256 hash of the link token is stored, so reading this table cannot
-- reconstruct a working link — the same discipline the email Token model already uses.
CREATE TABLE "CollectionShare" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "createdById" TEXT,
    "tokenHash" TEXT NOT NULL,
    "title" TEXT,
    "message" TEXT,
    "passwordHash" TEXT,
    "expiresAt" TIMESTAMP(3),
    "allowDownload" BOOLEAN NOT NULL DEFAULT true,
    "revokedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "lastViewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionShare_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShareView" (
    "id" TEXT NOT NULL,
    "shareId" TEXT NOT NULL,
    "visitorId" TEXT,
    "referer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareView_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CollectionShare_tokenHash_key" ON "CollectionShare"("tokenHash");
CREATE INDEX "CollectionShare_collectionId_createdAt_idx" ON "CollectionShare"("collectionId", "createdAt");
CREATE INDEX "ShareView_shareId_createdAt_idx" ON "ShareView"("shareId", "createdAt");

ALTER TABLE "CollectionShare" ADD CONSTRAINT "CollectionShare_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShareView" ADD CONSTRAINT "ShareView_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "CollectionShare"("id") ON DELETE CASCADE ON UPDATE CASCADE;
