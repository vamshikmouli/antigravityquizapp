-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "schoolId" TEXT,
ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "Quiz" ADD COLUMN     "schoolId" TEXT,
ADD COLUMN     "tenantId" TEXT;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "schoolId" TEXT,
ADD COLUMN     "tenantId" TEXT;
