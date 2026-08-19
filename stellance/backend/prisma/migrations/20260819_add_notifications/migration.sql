-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM (
  'CONTRACT_CREATED',
  'CONTRACT_FUNDED',
  'CONTRACT_COMPLETED',
  'CONTRACT_CANCELLED',
  'MILESTONE_SUBMITTED',
  'MILESTONE_APPROVED',
  'MILESTONE_PAID',
  'DISPUTE_RAISED',
  'DISPUTE_RESOLVED'
);

-- CreateTable
CREATE TABLE "Notification" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "type"        "NotificationType" NOT NULL,
    "title"       TEXT NOT NULL,
    "body"        TEXT NOT NULL,
    "read"        BOOLEAN NOT NULL DEFAULT false,
    "contractId"  TEXT,
    "milestoneId" TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");
CREATE INDEX "Notification_userId_read_idx" ON "Notification"("userId", "read");
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
