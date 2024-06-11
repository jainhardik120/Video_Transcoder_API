/*
  Warnings:

  - The values [UPLOADING_RAW,CONVERTING,UPLOADING_CONVERTED] on the enum `videoStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "videoStatus_new" AS ENUM ('INITIAL', 'UPLOADING', 'QUEUED', 'PROCESSING', 'FAILED');
ALTER TABLE "video" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "video" ALTER COLUMN "status" TYPE "videoStatus_new" USING ("status"::text::"videoStatus_new");
ALTER TYPE "videoStatus" RENAME TO "videoStatus_old";
ALTER TYPE "videoStatus_new" RENAME TO "videoStatus";
DROP TYPE "videoStatus_old";
ALTER TABLE "video" ALTER COLUMN "status" SET DEFAULT 'INITIAL';
COMMIT;
