import { z } from "zod";

export const parseEnvBoolean = (value: unknown): unknown => {
  if (value === undefined) return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return value;
  }
  if (typeof value !== "string") return value;

  const normalized = value.trim().toLowerCase();
  if (["true", "1"].includes(normalized)) return true;
  if (["false", "0", ""].includes(normalized)) return false;
  return value;
};

const envBoolean = z.preprocess((value) => parseEnvBoolean(value), z.boolean());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url(),
  LLM_PROVIDER: z.enum(["lmstudio", "ollama", "llamacpp"]).default("lmstudio"),
  LM_STUDIO_BASE_URL: z.url().optional(),
  LM_STUDIO_MODEL: z.string().min(1).optional(),
  LM_STUDIO_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.2),
  LM_STUDIO_MAX_TOKENS: z.coerce.number().int().min(64).max(8192).default(1200),
  OLLAMA_BASE_URL: z.url().optional(),
  OLLAMA_MODEL: z.string().min(1).optional(),
  OLLAMA_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.2),
  OLLAMA_MAX_TOKENS: z.coerce.number().int().min(64).max(8192).default(1200),
  OLLAMA_KEEP_ALIVE: z.string().min(1).default("10m"),
  LLAMACPP_BASE_URL: z.url().default("http://127.0.0.1:8081"),
  LLAMACPP_MODEL: z.string().min(1).default("granite4:3b"),
  LLM_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(45000),
  API_KEY_REQUIRED: envBoolean.default(false),
  AI_ENGINE_API_KEY: z.string().min(16).optional(),
  INTERNAL_API_KEY: z.string().min(16).optional(),
  RATE_LIMIT_ENABLED: envBoolean.default(true),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).max(600000).default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).max(10000).default(60),
  INFERENCE_MIN_AVAILABLE_MEMORY_MB: z.coerce.number().int().min(1).max(1024 * 1024).default(2000),
  INFERENCE_GATEWAY_HOST: z.string().min(1).default("127.0.0.1"),
  INFERENCE_GATEWAY_PORT: z.coerce.number().int().min(1).max(65535).default(18081),
  LLAMACPP_UPSTREAM_URL: z.url().default("http://127.0.0.1:8081"),
  INFERENCE_GATEWAY_UPSTREAM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(90000),
  INFERENCE_GATEWAY_TOTAL_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300000).default(120000),
  INFERENCE_QUEUE_TIMEOUT_MS: z.coerce.number().int().min(1).max(300000).default(30000),
  INFERENCE_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).max(600000).default(60000),
  INFERENCE_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).max(10000).default(10),
  INFERENCE_GLOBAL_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).max(10000).default(20),
  INFERENCE_MAX_COMPLETION_TOKENS: z.coerce.number().int().min(1).max(8192).default(550),
  INFERENCE_CONTEXT_SIZE_TOKENS: z.coerce.number().int().min(1).max(1048576).default(2048),
  INFERENCE_MAX_INPUT_ESTIMATED_TOKENS: z.coerce.number().int().min(1).max(1048576).default(1200),
  INFERENCE_INPUT_CHARS_PER_TOKEN: z.coerce.number().int().min(1).max(20).default(3),
  INFERENCE_MAX_MESSAGES: z.coerce.number().int().min(1).max(1000).default(32),
  INFERENCE_MAX_MESSAGE_CHARS: z.coerce.number().int().min(1).max(1048576).default(3600),
  INFERENCE_THERMAL_GATE_ENABLED: envBoolean.default(true),
  INFERENCE_THERMAL_START_C: z.coerce.number().min(0).max(125).default(65),
  INFERENCE_THERMAL_RESUME_C: z.coerce.number().min(0).max(125).default(60),
  INFERENCE_THERMAL_HARD_C: z.coerce.number().min(0).max(125).default(70),
  INFERENCE_THERMAL_RECHECK_MS: z.coerce.number().int().min(1).max(600000).default(5000),
  INFERENCE_THERMAL_MAX_WAIT_MS: z.coerce.number().int().min(1).max(600000).default(60000),
  INFERENCE_THERMAL_HWMON_NAME: z.string().regex(/^[A-Za-z0-9_-]+$/).default("k10temp"),
  INFERENCE_THERMAL_SENSOR: z.string().regex(/^[A-Za-z0-9_-]+$/).default("temp1")
}).superRefine((value, context) => {
  if (!(value.INFERENCE_THERMAL_RESUME_C < value.INFERENCE_THERMAL_START_C && value.INFERENCE_THERMAL_START_C < value.INFERENCE_THERMAL_HARD_C)) {
    context.addIssue({
      code: "custom",
      path: ["INFERENCE_THERMAL_RESUME_C"],
      message: "thermal thresholds must satisfy resume < start < hard"
    });
  }
  if (value.INFERENCE_MAX_INPUT_ESTIMATED_TOKENS + value.INFERENCE_MAX_COMPLETION_TOKENS >= value.INFERENCE_CONTEXT_SIZE_TOKENS) {
    context.addIssue({
      code: "custom",
      path: ["INFERENCE_MAX_INPUT_ESTIMATED_TOKENS"],
      message: "input and completion limits must leave context margin"
    });
  }
});

const parseEnvironment = (source: NodeJS.ProcessEnv) => {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }

  return parsed.data;
};

export const parseEnvironmentConfigForTest = parseEnvironment;

const parsedData = parseEnvironment(process.env);

const configuredApiKey = parsedData.AI_ENGINE_API_KEY ?? parsedData.INTERNAL_API_KEY;
const apiKeyRequired = parsedData.NODE_ENV === "production" || parsedData.API_KEY_REQUIRED;
const isNextBuild = process.env.NEXT_PHASE === "phase-production-build";

if (apiKeyRequired && !configuredApiKey && !isNextBuild) {
  throw new Error("Invalid environment configuration: AI_ENGINE_API_KEY is required outside development");
}

const providerConfig = parsedData.LLM_PROVIDER === "lmstudio"
  ? {
      baseUrl: parsedData.LM_STUDIO_BASE_URL,
      model: parsedData.LM_STUDIO_MODEL,
      temperature: parsedData.LM_STUDIO_TEMPERATURE,
      maxTokens: parsedData.LM_STUDIO_MAX_TOKENS
    }
  : parsedData.LLM_PROVIDER === "ollama" ? {
      baseUrl: parsedData.OLLAMA_BASE_URL,
      model: parsedData.OLLAMA_MODEL,
      temperature: parsedData.OLLAMA_TEMPERATURE,
      maxTokens: parsedData.OLLAMA_MAX_TOKENS
    } : {
      baseUrl: parsedData.LLAMACPP_BASE_URL,
      model: parsedData.LLAMACPP_MODEL,
      temperature: parsedData.OLLAMA_TEMPERATURE,
      maxTokens: parsedData.OLLAMA_MAX_TOKENS
    };

if (!providerConfig.baseUrl || !providerConfig.model) {
  throw new Error(`Invalid environment configuration: ${parsedData.LLM_PROVIDER} provider requires base URL and model`);
}

export const env = {
  ...parsedData,
  API_KEY_REQUIRED: apiKeyRequired,
  AI_ENGINE_API_KEY: configuredApiKey,
  LM_STUDIO: {
    baseUrl: parsedData.LM_STUDIO_BASE_URL ?? "http://127.0.0.1:1234",
    model: parsedData.LM_STUDIO_MODEL ?? "qwen2.5-7b-instruct",
    temperature: parsedData.LM_STUDIO_TEMPERATURE,
    maxTokens: parsedData.LM_STUDIO_MAX_TOKENS
  },
  OLLAMA: {
    baseUrl: parsedData.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434",
    model: parsedData.OLLAMA_MODEL ?? "",
    temperature: parsedData.OLLAMA_TEMPERATURE,
    maxTokens: parsedData.OLLAMA_MAX_TOKENS
  },
  LLAMACPP: {
    baseUrl: parsedData.LLAMACPP_BASE_URL,
    model: parsedData.LLAMACPP_MODEL,
    temperature: parsedData.OLLAMA_TEMPERATURE,
    maxTokens: parsedData.OLLAMA_MAX_TOKENS
  }
};
