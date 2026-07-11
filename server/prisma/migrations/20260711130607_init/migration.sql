-- CreateEnum
CREATE TYPE "SubmissionsStatus" AS ENUM ('Processing', 'Success', 'Failure');

-- CreateTable
CREATE TABLE "Submissions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "status" "SubmissionsStatus" NOT NULL,
    "output" TEXT,

    CONSTRAINT "Submissions_pkey" PRIMARY KEY ("id")
);
