-- CreateEnum
CREATE TYPE "MemoryDecision" AS ENUM ('PUBLISHED', 'PUBLISHED_DEFERRED', 'REJECTED');

-- AlterTable
ALTER TABLE "Agent" ADD COLUMN     "lastRunStatus" TEXT;

-- AlterTable
ALTER TABLE "Memory" ADD COLUMN     "compactedAt" TIMESTAMP(3),
ADD COLUMN     "decision" "MemoryDecision" NOT NULL DEFAULT 'PUBLISHED',
ADD COLUMN     "entities" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "entitiesRaw" JSONB;

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "title" TEXT,
ADD COLUMN     "whyNow" TEXT,
ADD COLUMN     "whySelected" TEXT;

-- CreateTable
CREATE TABLE "WorkerLease" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "lockedBy" TEXT,
    "lockedAt" TIMESTAMP(3),
    "leaseExpiresAt" TIMESTAMP(3),

    CONSTRAINT "WorkerLease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnownEntity" (
    "id" UUID NOT NULL,
    "canonicalName" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnownEntity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KnownEntity_canonicalName_key" ON "KnownEntity"("canonicalName");

-- CreateIndex
CREATE INDEX "Memory_decision_expiresAt_idx" ON "Memory"("decision", "expiresAt");

-- CreateIndex
CREATE INDEX "Memory_entities_idx" ON "Memory" USING GIN ("entities");
