CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" varchar(255) NOT NULL,
  "full_name" varchar(255),
  "role" varchar(50) DEFAULT 'operator' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "users_email_idx" ON "users" ("email");

CREATE TABLE "agent_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_name" varchar(40) NOT NULL,
  "status" varchar(20) DEFAULT 'success' NOT NULL,
  "input" jsonb NOT NULL,
  "raw_output" text,
  "parsed_output" jsonb,
  "model" varchar(120),
  "provider" varchar(40),
  "error_message" text,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "lead_records" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_run_id" uuid NOT NULL,
  "summary" text NOT NULL,
  "detected_service" varchar(120) NOT NULL,
  "lead_temperature" varchar(12) NOT NULL,
  "missing_information" jsonb NOT NULL,
  "suggested_next_action" text NOT NULL,
  "reply_to_client" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "landing_briefs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_run_id" uuid NOT NULL,
  "project_summary" text NOT NULL,
  "recommended_template" varchar(120) NOT NULL,
  "primary_cta" varchar(255) NOT NULL,
  "secondary_cta" varchar(255) NOT NULL,
  "suggested_sections" jsonb NOT NULL,
  "missing_information" jsonb NOT NULL,
  "brief_markdown" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "proposal_drafts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_run_id" uuid NOT NULL,
  "proposal_title" varchar(255) NOT NULL,
  "executive_summary" text NOT NULL,
  "scope" jsonb NOT NULL,
  "deliverables" jsonb NOT NULL,
  "assumptions" jsonb NOT NULL,
  "next_steps" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "support_cases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "agent_run_id" uuid NOT NULL,
  "category" varchar(30) NOT NULL,
  "priority" varchar(20) NOT NULL,
  "summary" text NOT NULL,
  "suggested_reply" text NOT NULL,
  "escalate_to_human" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "lead_records"
ADD CONSTRAINT "lead_records_agent_run_id_agent_runs_id_fk"
FOREIGN KEY ("agent_run_id")
REFERENCES "agent_runs"("id")
ON DELETE CASCADE;

ALTER TABLE "landing_briefs"
ADD CONSTRAINT "landing_briefs_agent_run_id_agent_runs_id_fk"
FOREIGN KEY ("agent_run_id")
REFERENCES "agent_runs"("id")
ON DELETE CASCADE;

ALTER TABLE "proposal_drafts"
ADD CONSTRAINT "proposal_drafts_agent_run_id_agent_runs_id_fk"
FOREIGN KEY ("agent_run_id")
REFERENCES "agent_runs"("id")
ON DELETE CASCADE;

ALTER TABLE "support_cases"
ADD CONSTRAINT "support_cases_agent_run_id_agent_runs_id_fk"
FOREIGN KEY ("agent_run_id")
REFERENCES "agent_runs"("id")
ON DELETE CASCADE;
