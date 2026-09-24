-- Enable pgvector for RAG embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Add DRESS to the garment type enum
ALTER TYPE "GarmentType" ADD VALUE IF NOT EXISTS 'DRESS';

-- Add fit type to brand sizes
ALTER TABLE "BrandSize"
ADD COLUMN IF NOT EXISTS "fitType" TEXT;

-- Replace the old BrandSize uniqueness rule
DROP INDEX IF EXISTS "BrandSize_brandId_garmentType_sizeLabel_key";

CREATE UNIQUE INDEX IF NOT EXISTS "BrandSize_brandId_garmentType_fitType_sizeLabel_key"
ON "BrandSize"("brandId", "garmentType", "fitType", "sizeLabel");

-- Create RAG document storage
CREATE TABLE IF NOT EXISTS "RagDocument" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(3072),
    "brand" TEXT NOT NULL,
    "garment" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT,
    "metadata" JSONB,

    CONSTRAINT "RagDocument_pkey" PRIMARY KEY ("id")
);
