-- CreateTable
CREATE TABLE "Image" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "ext" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "usage" TEXT NOT NULL DEFAULT 'image',
    "uploaderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Image_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Image_key_key" ON "Image"("key");

-- CreateIndex
CREATE INDEX "Image_createdAt_idx" ON "Image"("createdAt");

-- CreateIndex
CREATE INDEX "Image_usage_createdAt_idx" ON "Image"("usage", "createdAt");

-- CreateIndex
CREATE INDEX "Image_hash_idx" ON "Image"("hash");
