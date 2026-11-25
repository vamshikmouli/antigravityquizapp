-- AlterEnum
ALTER TYPE "QuestionType" ADD VALUE 'CLUE';

-- AlterTable
ALTER TABLE "Participant" ADD COLUMN     "eliminatedAt" TIMESTAMP(3),
ADD COLUMN     "eliminatedRound" INTEGER;

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "cluePoints" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "clues" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Quiz" ADD COLUMN     "mode" TEXT NOT NULL DEFAULT 'CLASSIC',
ADD COLUMN     "roundSettings" JSONB;

