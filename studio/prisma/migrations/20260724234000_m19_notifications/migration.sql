-- M19: the notification centre.
-- Notification is the durable in-app record; EmailLog is the delivery record for every email
-- the platform sends, written by a transport decorator so all mail is captured without
-- touching a call site.
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "entity" TEXT,
    "entityId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "userId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
CREATE INDEX "EmailLog_userId_createdAt_idx" ON "EmailLog"("userId", "createdAt");
CREATE INDEX "EmailLog_to_createdAt_idx" ON "EmailLog"("to", "createdAt");
CREATE INDEX "EmailLog_createdAt_idx" ON "EmailLog"("createdAt");

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Per-category email preferences. In-app notifications are always written; these govern
-- only whether we also send mail.
ALTER TABLE "DealerProfile"
  ADD COLUMN "notifyQuotes"  BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifySamples" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifyShares"  BOOLEAN NOT NULL DEFAULT true;
