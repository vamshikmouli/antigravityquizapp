-- Read-aloud mode: questions open without options or timer until the host shows them.
ALTER TABLE "Session" ADD COLUMN "readAloud" BOOLEAN NOT NULL DEFAULT false;
