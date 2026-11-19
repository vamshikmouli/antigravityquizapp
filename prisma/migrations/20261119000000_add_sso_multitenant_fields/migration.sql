-- AlterTable
ALTER TABLE "User" ADD COLUMN     "authProvider" TEXT NOT NULL DEFAULT 'EMAIL',
ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "schoolId" TEXT,
ADD COLUMN     "tenantId" TEXT,
ALTER COLUMN "password" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_externalId_key" ON "User"("tenantId", "externalId");
