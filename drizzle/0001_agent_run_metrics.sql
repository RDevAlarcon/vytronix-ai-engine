ALTER TABLE "agent_runs"
ADD COLUMN "speed_mode" varchar(20);

ALTER TABLE "agent_runs"
ADD COLUMN "attempt_count" integer DEFAULT 1 NOT NULL;

ALTER TABLE "agent_runs"
ADD COLUMN "duration_ms" integer;

ALTER TABLE "agent_runs"
ADD COLUMN "usage" jsonb;
