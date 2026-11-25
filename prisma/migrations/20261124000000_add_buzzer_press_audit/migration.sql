-- CreateTable
CREATE TABLE "BuzzerPress" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "participantName" TEXT,
    "claimedMs" INTEGER,
    "observedMs" INTEGER,
    "rttMs" INTEGER,
    "creditMs" INTEGER,
    "effectiveMs" INTEGER,
    "flags" TEXT[],
    "outcome" TEXT NOT NULL,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BuzzerPress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BuzzerPress_sessionId_questionId_idx" ON "BuzzerPress"("sessionId", "questionId");

-- CreateIndex
CREATE INDEX "BuzzerPress_roundId_idx" ON "BuzzerPress"("roundId");

-- AddForeignKey
ALTER TABLE "BuzzerPress" ADD CONSTRAINT "BuzzerPress_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

