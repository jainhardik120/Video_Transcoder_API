-- CreateEnum
CREATE TYPE "videoStatus" AS ENUM ('UPLOADING_RAW', 'QUEUED', 'CONVERTING', 'ERROR', 'UPLOADING_CONVERTED', 'FAILED');

-- CreateTable
CREATE TABLE "video" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "videoStatus" NOT NULL,
    "raw_file_name" TEXT NOT NULL,

    CONSTRAINT "video_pkey" PRIMARY KEY ("id")
);
