import "dotenv/config";
import { DEFAULT_INFERENCE_CONTEXT_SIZE_TOKENS, DEFAULT_INFERENCE_INPUT_CHARS_PER_TOKEN, DEFAULT_INFERENCE_MAX_INPUT_ESTIMATED_TOKENS, DEFAULT_INFERENCE_MAX_MESSAGE_CHARS, DEFAULT_INFERENCE_MAX_MESSAGES } from "../inference-input-limits";
import { DEFAULT_INFERENCE_GATEWAY_HOST, DEFAULT_INFERENCE_GATEWAY_PORT, DEFAULT_INFERENCE_GATEWAY_QUEUE_TIMEOUT_MS, DEFAULT_INFERENCE_GATEWAY_TOTAL_TIMEOUT_MS, DEFAULT_INFERENCE_GATEWAY_UPSTREAM_TIMEOUT_MS, DEFAULT_INFERENCE_GLOBAL_RATE_LIMIT_MAX_REQUESTS, DEFAULT_INFERENCE_MAX_COMPLETION_TOKENS, DEFAULT_INFERENCE_RATE_LIMIT_MAX_REQUESTS, DEFAULT_INFERENCE_RATE_LIMIT_WINDOW_MS, DEFAULT_LLAMACPP_UPSTREAM_URL, createInferenceGateway } from "./gateway";
import { ProductionMemoryGate } from "../memory-gate";
import { LinuxThermalReader } from "../thermal-reader";
import { DEFAULT_THERMAL_HARD_THRESHOLD_C, DEFAULT_THERMAL_MAX_WAIT_MS, DEFAULT_THERMAL_RECHECK_MS, DEFAULT_THERMAL_RESUME_THRESHOLD_C, DEFAULT_THERMAL_START_THRESHOLD_C, ProductionThermalGate } from "../thermal-gate";

const parseInteger = (name: string, fallback: number): number => {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
};

const parseNumber = (name: string, fallback: number): number => {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative number`);
  }
  return parsed;
};

const parseBoolean = (name: string, fallback: boolean): boolean => {
  const value = process.env[name];
  if (!value) return fallback;
  if (["1", "true", "yes"].includes(value.toLowerCase())) return true;
  if (["0", "false", "no"].includes(value.toLowerCase())) return false;
  throw new Error(`${name} must be boolean`);
};

const gateway = createInferenceGateway({
  host: process.env.INFERENCE_GATEWAY_HOST ?? DEFAULT_INFERENCE_GATEWAY_HOST,
  port: parseInteger("INFERENCE_GATEWAY_PORT", DEFAULT_INFERENCE_GATEWAY_PORT),
  upstreamUrl: process.env.LLAMACPP_UPSTREAM_URL ?? DEFAULT_LLAMACPP_UPSTREAM_URL,
  upstreamTimeoutMs: parseInteger("INFERENCE_GATEWAY_UPSTREAM_TIMEOUT_MS", DEFAULT_INFERENCE_GATEWAY_UPSTREAM_TIMEOUT_MS),
  totalTimeoutMs: parseInteger("INFERENCE_GATEWAY_TOTAL_TIMEOUT_MS", DEFAULT_INFERENCE_GATEWAY_TOTAL_TIMEOUT_MS),
  queueTimeoutMs: parseInteger("INFERENCE_QUEUE_TIMEOUT_MS", DEFAULT_INFERENCE_GATEWAY_QUEUE_TIMEOUT_MS),
  rateLimitWindowMs: parseInteger("INFERENCE_RATE_LIMIT_WINDOW_MS", DEFAULT_INFERENCE_RATE_LIMIT_WINDOW_MS),
  rateLimitMaxRequests: parseInteger("INFERENCE_RATE_LIMIT_MAX_REQUESTS", DEFAULT_INFERENCE_RATE_LIMIT_MAX_REQUESTS),
  globalRateLimitMaxRequests: parseInteger("INFERENCE_GLOBAL_RATE_LIMIT_MAX_REQUESTS", DEFAULT_INFERENCE_GLOBAL_RATE_LIMIT_MAX_REQUESTS),
  maxCompletionTokens: parseInteger("INFERENCE_MAX_COMPLETION_TOKENS", DEFAULT_INFERENCE_MAX_COMPLETION_TOKENS),
  contextSizeTokens: parseInteger("INFERENCE_CONTEXT_SIZE_TOKENS", DEFAULT_INFERENCE_CONTEXT_SIZE_TOKENS),
  maxInputEstimatedTokens: parseInteger("INFERENCE_MAX_INPUT_ESTIMATED_TOKENS", DEFAULT_INFERENCE_MAX_INPUT_ESTIMATED_TOKENS),
  inputCharsPerToken: parseInteger("INFERENCE_INPUT_CHARS_PER_TOKEN", DEFAULT_INFERENCE_INPUT_CHARS_PER_TOKEN),
  maxMessages: parseInteger("INFERENCE_MAX_MESSAGES", DEFAULT_INFERENCE_MAX_MESSAGES),
  maxMessageChars: parseInteger("INFERENCE_MAX_MESSAGE_CHARS", DEFAULT_INFERENCE_MAX_MESSAGE_CHARS)
}, {
  memoryGate: new ProductionMemoryGate(parseInteger("INFERENCE_MIN_AVAILABLE_MEMORY_MB", 2000)),
  thermalGate: new ProductionThermalGate({
    enabled: parseBoolean("INFERENCE_THERMAL_GATE_ENABLED", true),
    startThresholdC: parseNumber("INFERENCE_THERMAL_START_C", DEFAULT_THERMAL_START_THRESHOLD_C),
    resumeThresholdC: parseNumber("INFERENCE_THERMAL_RESUME_C", DEFAULT_THERMAL_RESUME_THRESHOLD_C),
    hardThresholdC: parseNumber("INFERENCE_THERMAL_HARD_C", DEFAULT_THERMAL_HARD_THRESHOLD_C),
    recheckMs: parseInteger("INFERENCE_THERMAL_RECHECK_MS", DEFAULT_THERMAL_RECHECK_MS),
    maxWaitMs: parseInteger("INFERENCE_THERMAL_MAX_WAIT_MS", DEFAULT_THERMAL_MAX_WAIT_MS)
  }, new LinuxThermalReader({
    hwmonName: process.env.INFERENCE_THERMAL_HWMON_NAME ?? "k10temp",
    sensor: process.env.INFERENCE_THERMAL_SENSOR ?? "temp1"
  })),
  logger: console
});

const port = await gateway.listen();
console.log(`Inference gateway listening on ${gateway.config.host}:${port}, upstream=${gateway.config.upstreamUrl}`);

const shutdown = async () => {
  await gateway.close();
  process.exit(0);
};

process.on("SIGINT", () => { void shutdown(); });
process.on("SIGTERM", () => { void shutdown(); });
