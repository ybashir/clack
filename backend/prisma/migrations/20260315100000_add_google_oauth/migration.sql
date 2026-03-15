-- AlterTable: Add googleId and make password optional
ALTER TABLE "User" ADD COLUMN "googleId" VARCHAR(255);
ALTER TABLE "User" ALTER COLUMN "password" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
