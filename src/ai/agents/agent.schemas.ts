import { z } from "zod";

const scopeGuardSchema = {
  is_in_scope: z.boolean(),
  out_of_scope_reason: z.string().nullable(),
  safe_reply: z.string().min(1)
};

export const leadInputSchema = z.object({
  leadMessage: z.string().min(10),
  companyContext: z.string().optional(),
  knownServices: z.array(z.string().min(1)).default([])
});

export const leadOutputSchema = z.object({
  summary: z.string().min(1),
  detected_service: z.string().min(1),
  lead_temperature: z.enum(["cold", "warm", "hot"]),
  missing_information: z.array(z.string()),
  suggested_next_action: z.string().min(1),
  reply_to_client: z.string().min(1),
  ...scopeGuardSchema
});

export const landingInputSchema = z.object({
  projectName: z.string().min(2),
  objective: z.string().min(10),
  audience: z.string().min(5),
  offer: z.string().min(3),
  constraints: z.array(z.string()).default([]),
  notes: z.string().optional()
});

export const landingOutputSchema = z.object({
  project_summary: z.string().min(1),
  recommended_template: z.string().min(1),
  primary_cta: z.string().min(1),
  secondary_cta: z.string().min(1),
  suggested_sections: z.array(z.string()).min(1),
  missing_information: z.array(z.string()),
  brief_markdown: z.string().min(1),
  ...scopeGuardSchema
});

export const proposalInputSchema = z.object({
  clientName: z.string().min(2),
  businessGoal: z.string().min(10),
  requestedServices: z.array(z.string()).min(1),
  timeline: z.string().optional(),
  budgetRange: z.string().optional(),
  constraints: z.array(z.string()).default([])
});

export const proposalOutputSchema = z.object({
  proposal_title: z.string().min(1),
  executive_summary: z.string().min(1),
  scope: z.array(z.string()).min(1),
  deliverables: z.array(z.string()).min(1),
  assumptions: z.array(z.string()),
  next_steps: z.array(z.string()).min(1),
  ...scopeGuardSchema
});

export const supportInputSchema = z.object({
  ticketMessage: z.string().min(10),
  customerName: z.string().optional(),
  accountType: z.string().optional(),
  productArea: z.string().optional(),
  knownContext: z.string().optional()
});

export const supportOutputSchema = z.object({
  category: z.enum(["billing", "technical", "access", "general", "other"]),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  summary: z.string().min(1),
  suggested_reply: z.string().min(1),
  escalate_to_human: z.boolean(),
  ...scopeGuardSchema
});
