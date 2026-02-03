-- CreateEnum
CREATE TYPE "MusicTrackType" AS ENUM ('QUESTION', 'OPTIONS', 'ANSWER', 'ROUND_RESULTS', 'FINAL_RESULTS');

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "musicVolume" DOUBLE PRECISION NOT NULL DEFAULT 0.5;

-- CreateTable
CREATE TABLE "MusicTrack" (
    "id" TEXT NOT NULL,
    "type" "MusicTrackType" NOT NULL,
    "filename" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MusicTrack_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MusicTrack_ownerId_type_key" ON "MusicTrack"("ownerId", "type");

-- AddForeignKey
ALTER TABLE "MusicTrack" ADD CONSTRAINT "MusicTrack_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
