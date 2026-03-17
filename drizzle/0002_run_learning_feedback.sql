ALTER TABLE "agent_runs"
ADD COLUMN "quality_score" integer;

ALTER TABLE "agent_runs"
ADD COLUMN "quality_flags" jsonb;

ALTER TABLE "agent_runs"
ADD COLUMN "improvement_signals" jsonb;

ALTER TABLE "agent_runs"
ADD COLUMN "feedback_value" varchar(20);

ALTER TABLE "agent_runs"
ADD COLUMN "feedback_comment" text;

ALTER TABLE "agent_runs"
ADD COLUMN "feedback_at" timestamp with time zone;
