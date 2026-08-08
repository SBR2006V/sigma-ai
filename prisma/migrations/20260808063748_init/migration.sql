-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('ACTIVE', 'PAUSED', 'STOPPED');

-- CreateEnum
CREATE TYPE "TopicStatus" AS ENUM ('DISCOVERED', 'HELD', 'REJECTED', 'SKIPPED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "MemoryTier" AS ENUM ('SHORT_TERM', 'LONG_TERM');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('AGENT_INITIALIZED', 'DISCOVERY_STARTED', 'DISCOVERY_COMPLETED', 'TOPIC_DISCOVERED', 'TOPIC_REJECTED', 'TOPIC_HELD', 'TOPIC_SKIPPED', 'TOPIC_SELECTED', 'POST_GENERATED', 'POST_PUBLISHED', 'MEMORY_CREATED', 'MEMORY_UPDATED', 'RUN_COMPLETED', 'RUN_FAILED');

-- CreateTable
CREATE TABLE "Agent" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "status" "AgentStatus" NOT NULL DEFAULT 'ACTIVE',
    "initializedAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "nextRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Topic" (
    "id" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "canonicalKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "url" TEXT NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceType" TEXT,
    "category" TEXT,
    "tags" JSONB,
    "publishedAt" TIMESTAMP(3),
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editorialScore" INTEGER,
    "status" "TopicStatus" NOT NULL DEFAULT 'DISCOVERED',
    "decisionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "topicId" UUID,
    "text" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "sources" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Memory" (
    "id" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "topicId" UUID,
    "postId" UUID,
    "tier" "MemoryTier" NOT NULL,
    "topicKey" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "importantPoints" JSONB,
    "keywords" JSONB,
    "editorialOpinion" TEXT,
    "fullPost" TEXT,
    "sources" JSONB,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "lastPublishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Memory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityLog" (
    "id" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "topicId" UUID,
    "type" "ActivityType" NOT NULL,
    "message" TEXT NOT NULL,
    "score" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Agent_status_idx" ON "Agent"("status");

-- CreateIndex
CREATE INDEX "Agent_nextRunAt_idx" ON "Agent"("nextRunAt");

-- CreateIndex
CREATE INDEX "Topic_agentId_status_idx" ON "Topic"("agentId", "status");

-- CreateIndex
CREATE INDEX "Topic_agentId_editorialScore_idx" ON "Topic"("agentId", "editorialScore");

-- CreateIndex
CREATE INDEX "Topic_publishedAt_idx" ON "Topic"("publishedAt");

-- CreateIndex
CREATE INDEX "Topic_lastSeenAt_idx" ON "Topic"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "Topic_agentId_canonicalKey_key" ON "Topic"("agentId", "canonicalKey");

-- CreateIndex
CREATE INDEX "Post_agentId_createdAt_idx" ON "Post"("agentId", "createdAt");

-- CreateIndex
CREATE INDEX "Post_topicId_idx" ON "Post"("topicId");

-- CreateIndex
CREATE INDEX "Memory_agentId_topicKey_idx" ON "Memory"("agentId", "topicKey");

-- CreateIndex
CREATE INDEX "Memory_agentId_tier_idx" ON "Memory"("agentId", "tier");

-- CreateIndex
CREATE INDEX "Memory_expiresAt_idx" ON "Memory"("expiresAt");

-- CreateIndex
CREATE INDEX "Memory_lastSeenAt_idx" ON "Memory"("lastSeenAt");

-- CreateIndex
CREATE INDEX "ActivityLog_agentId_createdAt_idx" ON "ActivityLog"("agentId", "createdAt");

-- CreateIndex
CREATE INDEX "ActivityLog_agentId_type_idx" ON "ActivityLog"("agentId", "type");

-- AddForeignKey
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Memory" ADD CONSTRAINT "Memory_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Memory" ADD CONSTRAINT "Memory_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Memory" ADD CONSTRAINT "Memory_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
