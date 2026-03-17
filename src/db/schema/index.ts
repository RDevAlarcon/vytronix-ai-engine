import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
};

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 255 }).notNull(),
    fullName: varchar("full_name", { length: 255 }),
    role: varchar("role", { length: 50 }).notNull().default("operator"),
    ...timestamps
  },
  (table) => ({
    usersEmailIdx: uniqueIndex("users_email_idx").on(table.email)
  })
);

export const agentRuns = pgTable("agent_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentName: varchar("agent_name", { length: 40 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("success"),
  input: jsonb("input").notNull(),
  rawOutput: text("raw_output"),
  parsedOutput: jsonb("parsed_output"),
  model: varchar("model", { length: 120 }),
  provider: varchar("provider", { length: 40 }),
  speedMode: varchar("speed_mode", { length: 20 }),
  attemptCount: integer("attempt_count").notNull().default(1),
  durationMs: integer("duration_ms"),
  usage: jsonb("usage"),
  qualityScore: integer("quality_score"),
  qualityFlags: jsonb("quality_flags"),
  improvementSignals: jsonb("improvement_signals"),
  feedbackValue: varchar("feedback_value", { length: 20 }),
  feedbackComment: text("feedback_comment"),
  feedbackAt: timestamp("feedback_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ...timestamps
});

export const leadRecords = pgTable("lead_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentRunId: uuid("agent_run_id")
    .notNull()
    .references(() => agentRuns.id, { onDelete: "cascade" }),
  summary: text("summary").notNull(),
  detectedService: varchar("detected_service", { length: 120 }).notNull(),
  leadTemperature: varchar("lead_temperature", { length: 12 }).notNull(),
  missingInformation: jsonb("missing_information").notNull(),
  suggestedNextAction: text("suggested_next_action").notNull(),
  replyToClient: text("reply_to_client").notNull(),
  ...timestamps
});

export const landingBriefs = pgTable("landing_briefs", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentRunId: uuid("agent_run_id")
    .notNull()
    .references(() => agentRuns.id, { onDelete: "cascade" }),
  projectSummary: text("project_summary").notNull(),
  recommendedTemplate: varchar("recommended_template", { length: 120 }).notNull(),
  primaryCta: varchar("primary_cta", { length: 255 }).notNull(),
  secondaryCta: varchar("secondary_cta", { length: 255 }).notNull(),
  suggestedSections: jsonb("suggested_sections").notNull(),
  missingInformation: jsonb("missing_information").notNull(),
  briefMarkdown: text("brief_markdown").notNull(),
  ...timestamps
});

export const proposalDrafts = pgTable("proposal_drafts", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentRunId: uuid("agent_run_id")
    .notNull()
    .references(() => agentRuns.id, { onDelete: "cascade" }),
  proposalTitle: varchar("proposal_title", { length: 255 }).notNull(),
  executiveSummary: text("executive_summary").notNull(),
  scope: jsonb("scope").notNull(),
  deliverables: jsonb("deliverables").notNull(),
  assumptions: jsonb("assumptions").notNull(),
  nextSteps: jsonb("next_steps").notNull(),
  ...timestamps
});

export const supportCases = pgTable("support_cases", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentRunId: uuid("agent_run_id")
    .notNull()
    .references(() => agentRuns.id, { onDelete: "cascade" }),
  category: varchar("category", { length: 30 }).notNull(),
  priority: varchar("priority", { length: 20 }).notNull(),
  summary: text("summary").notNull(),
  suggestedReply: text("suggested_reply").notNull(),
  escalateToHuman: boolean("escalate_to_human").notNull().default(false),
  ...timestamps
});

export type AgentRunInsert = typeof agentRuns.$inferInsert;
export type AgentRunSelect = typeof agentRuns.$inferSelect;
