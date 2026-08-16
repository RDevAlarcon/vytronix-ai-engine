import type { BenchmarkResult, BenchmarkSummary } from "./types";

const average = (values: number[]): number | null => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const percentile = (values: number[], p: number): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] ?? null;
};

export const tokensPerSecond = (outputTokens: number | null, durationMs: number): number | null =>
  outputTokens !== null && outputTokens > 0 && durationMs > 0 ? outputTokens / (durationMs / 1000) : null;

export const summarizeResults = (results: BenchmarkResult[]): BenchmarkSummary => {
  const latencies = results.filter((result) => !result.warmup).map((result) => result.durationMs);
  const successful = results.filter((result) => !result.warmup && result.success);
  const schemaValid = results.filter((result) => !result.warmup && result.schemaValid);
  const guardrailResults = results.filter((result) => !result.warmup && result.guardrailPassed !== null);
  const outputTokens = successful.map((result) => result.outputTokens).filter((value): value is number => value !== null);
  const errorsByCode: Record<string, number> = {};
  for (const result of results.filter((item) => !item.warmup && item.errorCode)) {
    const code = result.errorCode as string;
    errorsByCode[code] = (errorsByCode[code] ?? 0) + 1;
  }

  return {
    totalCases: latencies.length,
    successRate: latencies.length ? successful.length / latencies.length : 0,
    schemaValidRate: latencies.length ? schemaValid.length / latencies.length : 0,
    guardrailPassRate: guardrailResults.length ? guardrailResults.filter((result) => result.guardrailPassed).length / guardrailResults.length : 0,
    averageLatencyMs: average(latencies),
    medianLatencyMs: percentile(latencies, 0.5),
    p95LatencyMs: percentile(latencies, 0.95),
    averageOutputTokens: average(outputTokens),
    totalOutputTokens: outputTokens.reduce((sum, value) => sum + value, 0),
    totalRetries: results.filter((result) => !result.warmup).reduce((sum, result) => sum + Math.max(0, result.attemptCount - 1), 0),
    errorsByCode
  };
};
