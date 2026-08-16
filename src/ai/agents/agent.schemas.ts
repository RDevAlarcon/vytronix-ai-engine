import { z } from "zod";

const scopeGuardSchema = {
  is_in_scope: z.boolean(),
  out_of_scope_reason: z.string().nullable(),
  safe_reply: z.string().min(1)
};

export const leadInputSchema = z.object({
  leadMessage: z.string().min(10).max(4000),
  companyContext: z.string().max(2000).optional(),
  knownServices: z.array(z.string().min(1).max(200)).max(20).default([])
});

export const UNKNOWN_DETECTED_SERVICE = "unknown";

export const leadOutputSchema = z.object({
  summary: z.string().min(1),
  detected_service: z.string().min(1),
  lead_temperature: z.enum(["cold", "warm", "hot"]),
  missing_information: z.array(z.string().max(500)).max(20),
  suggested_next_action: z.string().min(1).max(2000),
  reply_to_client: z.string().min(1).max(4000),
  ...scopeGuardSchema
});

export const landingInputSchema = z.object({
  projectName: z.string().min(2).max(300),
  objective: z.string().min(10).max(4000),
  audience: z.string().min(5).max(2000),
  offer: z.string().min(3).max(2000),
  constraints: z.array(z.string().max(500)).max(20).default([]),
  notes: z.string().max(2000).optional()
});

export const landingOutputSchema = z.object({
  project_summary: z.string().min(1),
  recommended_template: z.string().min(1),
  primary_cta: z.string().min(1),
  secondary_cta: z.string().min(1),
  suggested_sections: z.array(z.string().max(200)).min(1).max(20),
  missing_information: z.array(z.string().max(500)).max(20),
  brief_markdown: z.string().min(1).max(12000),
  ...scopeGuardSchema
});

export const proposalInputSchema = z.object({
  clientName: z.string().min(2).max(300),
  businessGoal: z.string().min(10).max(4000),
  requestedServices: z.array(z.string().max(500)).min(1).max(20),
  timeline: z.string().max(500).optional(),
  budgetRange: z.string().max(500).optional(),
  constraints: z.array(z.string().max(500)).max(20).default([])
});

export const proposalOutputSchema = z.object({
  proposal_title: z.string().min(1),
  executive_summary: z.string().min(1),
  scope: z.array(z.string().max(500)).min(1).max(20),
  deliverables: z.array(z.string().max(500)).min(1).max(20),
  assumptions: z.array(z.string().max(500)).max(20),
  next_steps: z.array(z.string().max(500)).min(1).max(20),
  ...scopeGuardSchema
});

export const supportInputSchema = z.object({
  ticketMessage: z.string().min(10).max(4000),
  customerName: z.string().max(300).optional(),
  accountType: z.string().max(100).optional(),
  productArea: z.string().max(300).optional(),
  knownContext: z.string().max(2000).optional()
});

export const supportOutputSchema = z.object({
  category: z.enum(["billing", "technical", "access", "general", "other"]),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  summary: z.string().min(1),
  suggested_reply: z.string().min(1),
  escalate_to_human: z.boolean(),
  ...scopeGuardSchema
});
