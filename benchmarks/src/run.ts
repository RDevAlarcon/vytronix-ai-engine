import { config } from "dotenv";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { benchmarkCasesSchema, type BenchmarkCase, type BenchmarkResult } from "./types";
import { summarizeResults, tokensPerSecond } from "./metrics";
import { AppError } from "@/lib/errors";

config();

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const provider = (arg("provider") ?? process.env.BENCHMARK_PROVIDER ?? process.env.LLM_PROVIDER ?? "lmstudio") as "lmstudio" | "ollama";
const model = arg("model") ?? process.env.BENCHMARK_MODEL;
const benchmarkTemperature = Number(process.env.BENCHMARK_TEMPERATURE ?? (provider === "lmstudio" ? process.env.LM_STUDIO_TEMPERATURE ?? "0.2" : process.env.OLLAMA_TEMPERATURE ?? "0.2"));
const benchmarkMaxTokens = Number(process.env.BENCHMARK_MAX_TOKENS ?? (provider === "lmstudio" ? process.env.LM_STUDIO_MAX_TOKENS ?? "1200" : process.env.OLLAMA_MAX_TOKENS ?? "1200"));
const repetitions = Number(arg("repetitions") ?? process.env.BENCHMARK_REPETITIONS ?? "1");
const warmups = Number(arg("warmup") ?? process.env.BENCHMARK_WARMUP_RUNS ?? "0");
const selectedAgents = new Set((arg("agents") ?? process.env.BENCHMARK_AGENTS ?? "").split(",").filter(Boolean));
const selectedCases = new Set((arg("cases") ?? process.env.BENCHMARK_CASES ?? "").split(",").filter(Boolean));

if (provider !== "lmstudio" && provider !== "ollama") throw new Error("Invalid benchmark provider");
if (!Number.isInteger(repetitions) || repetitions < 1 || !Number.isInteger(warmups) || warmups < 0) throw new Error("Invalid repetitions or warmup configuration");
process.env.LLM_PROVIDER = provider;
if (model) {
  if (provider === "lmstudio") process.env.LM_STUDIO_MODEL = model;
  else process.env.OLLAMA_MODEL = model;
}

const main = async () => {
const { runAgent } = await import("@/ai/agents/agent.router");
const { llmService } = await import("@/ai/llm/llm.service");
const casesPath = resolve(process.cwd(), "benchmarks", "cases", "cases.json");
const cases = benchmarkCasesSchema.parse(JSON.parse(await readFile(casesPath, "utf8")))
  .filter((item) => (!selectedAgents.size || selectedAgents.has(item.agent)) && (!selectedCases.size || selectedCases.has(item.id)));
if (!cases.length) throw new Error("Benchmark selection produced no cases");

// Preflight is intentionally outside the dataset metrics. It prevents a
// disconnected provider from producing a misleading all-error benchmark.
await llmService.chat({
  messages: [{ role: "user", content: "Reply with the word READY." }],
  model,
  temperature: 0,
  maxTokens: 16
});

const runId = randomUUID();
const timestamp = new Date().toISOString();
const results: BenchmarkResult[] = [];
const execute = async (item: BenchmarkCase, warmup: boolean, repetition: number) => {
  const startedAt = Date.now();
  try {
    const result = await runAgent({ agent: item.agent, input: item.input, mode: "standard" });
    const durationMs = Date.now() - startedAt;
    const outputTokens = result.usage?.completionTokens ?? null;
    const schemaValid = Boolean(result.parsedOutput);
    const scopeValue = (result.parsedOutput as { is_in_scope?: boolean }).is_in_scope;
    results.push({ benchmarkRunId: runId, timestamp, caseId: item.id, agent: item.agent, configuredProvider: provider, provider: result.provider, model: result.model, temperature: benchmarkTemperature, maxTokens: benchmarkMaxTokens, success: true, durationMs, timeToFirstTokenMs: null, inputTokens: result.usage?.promptTokens ?? null, outputTokens, totalTokens: result.usage?.totalTokens ?? null, tokensPerSecond: tokensPerSecond(outputTokens, durationMs), attemptCount: result.attemptCount, schemaValid, guardrailPassed: scopeValue === undefined ? null : scopeValue === item.expected.inScope, errorCode: null, warmup, repetition, diagnostics: process.env.BENCHMARK_CAPTURE_RAW_OUTPUT === "true" ? result.diagnostics : undefined });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const errorCode = error instanceof AppError ? error.code : "UNEXPECTED_ERROR";
    const details = error instanceof AppError && error.details && typeof error.details === "object" ? error.details as { diagnostics?: BenchmarkResult["diagnostics"] } : {};
    results.push({ benchmarkRunId: runId, timestamp, caseId: item.id, agent: item.agent, configuredProvider: provider, provider: null, model: model ?? null, temperature: benchmarkTemperature, maxTokens: benchmarkMaxTokens, success: false, durationMs, timeToFirstTokenMs: null, inputTokens: null, outputTokens: null, totalTokens: null, tokensPerSecond: null, attemptCount: 0, schemaValid: false, guardrailPassed: null, errorCode, warmup, repetition, diagnostics: process.env.BENCHMARK_CAPTURE_RAW_OUTPUT === "true" ? details.diagnostics : undefined });
    if (warmup) console.warn(`WARMUP FAIL ${item.id}: ${errorCode}`);
  }
};

for (const item of cases) for (let warmup = 0; warmup < warmups; warmup += 1) await execute(item, true, warmup + 1);
for (let repetition = 1; repetition <= repetitions; repetition += 1) for (const item of cases) await execute(item, false, repetition);

const summary = summarizeResults(results);
const output = { benchmarkRunId: runId, timestamp, config: { provider, model: model ?? null, temperature: benchmarkTemperature, maxTokens: benchmarkMaxTokens, repetitions, warmups, agents: [...selectedAgents], cases: [...selectedCases], timeToFirstToken: null }, summary, results };
const resultDir = resolve(process.cwd(), "benchmarks", "results");
await mkdir(resultDir, { recursive: true });
const outputPath = join(resultDir, `benchmark-${timestamp.replace(/[:.]/g, "-")}.json`);
await writeFile(outputPath, JSON.stringify(output, null, 2), "utf8");
console.log(`Provider: ${provider}`);
console.log(`Model: ${model ?? "configured default"}`);
console.log(`Cases: ${summary.totalCases}`);
console.log(`Success: ${(summary.successRate * 100).toFixed(1)}%`);
console.log(`Schema valid: ${(summary.schemaValidRate * 100).toFixed(1)}%`);
console.log(`Guardrail pass: ${(summary.guardrailPassRate * 100).toFixed(1)}%`);
console.log(`Avg latency: ${summary.averageLatencyMs ?? "n/a"}ms | P95: ${summary.p95LatencyMs ?? "n/a"}ms`);
console.log(`Results: ${outputPath}`);
};

void main();
