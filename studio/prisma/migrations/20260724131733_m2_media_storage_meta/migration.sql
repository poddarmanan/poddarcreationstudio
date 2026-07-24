-- AlterTable
ALTER TABLE "Media" ADD COLUMN     "checksum" TEXT,
ADD COLUMN     "etag" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "storageKey" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateIndex
CREATE INDEX "Media_storageKey_idx" ON "Media"("storageKey");
