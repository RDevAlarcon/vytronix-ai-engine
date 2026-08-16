import { z } from "zod";
import type { StructuredOutputDiagnostic } from "@/ai/structured-output/structured-output";

export const benchmarkCaseSchema = z.object({
  id: z.string().min(1),
  agent: z.enum(["lead", "landing", "proposal", "support"]),
  description: z.string().min(1),
  input: z.record(z.string(), z.unknown()),
  expected: z.object({ inScope: z.boolean() }),
  tags: z.array(z.string().min(1)).min(1)
});

export const benchmarkCasesSchema = z.array(benchmarkCaseSchema).min(1);
export type BenchmarkCase = z.infer<typeof benchmarkCaseSchema>;

export type BenchmarkResult = {
  benchmarkRunId: string;
  timestamp: string;
  caseId: string;
  agent: BenchmarkCase["agent"];
  configuredProvider: "lmstudio" | "ollama";
  provider: string | null;
  model: string | null;
  temperature: number;
  maxTokens: number;
  success: boolean;
  durationMs: number;
  timeToFirstTokenMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  tokensPerSecond: number | null;
  attemptCount: number;
  schemaValid: boolean;
  guardrailPassed: boolean | null;
  errorCode: string | null;
  warmup: boolean;
  repetition: number;
  diagnostics?: StructuredOutputDiagnostic[];
};

export type BenchmarkSummary = {
  totalCases: number;
  successRate: number;
  schemaValidRate: number;
  guardrailPassRate: number;
  averageLatencyMs: number | null;
  medianLatencyMs: number | null;
  p95LatencyMs: number | null;
  averageOutputTokens: number | null;
  totalOutputTokens: number;
  totalRetries: number;
  errorsByCode: Record<string, number>;
};
