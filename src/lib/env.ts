import { z } from "zod";

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
  LLAMACPP_BASE_URL: z.url().default("http://127.0.0.1:8081"),
  LLAMACPP_MODEL: z.string().min(1).default("granite4:3b"),
  LLM_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(45000),
  API_KEY_REQUIRED: z.coerce.boolean().default(false),
  AI_ENGINE_API_KEY: z.string().min(16).optional(),
  INTERNAL_API_KEY: z.string().min(16).optional(),
  RATE_LIMIT_ENABLED: z.coerce.boolean().default(true),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).max(600000).default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).max(10000).default(60)
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid environment configuration: ${issues}`);
}

const configuredApiKey = parsed.data.AI_ENGINE_API_KEY ?? parsed.data.INTERNAL_API_KEY;
const apiKeyRequired = parsed.data.NODE_ENV === "production" || parsed.data.API_KEY_REQUIRED;
const isNextBuild = process.env.NEXT_PHASE === "phase-production-build";

if (apiKeyRequired && !configuredApiKey && !isNextBuild) {
  throw new Error("Invalid environment configuration: AI_ENGINE_API_KEY is required outside development");
}

const providerConfig = parsed.data.LLM_PROVIDER === "lmstudio"
  ? {
      baseUrl: parsed.data.LM_STUDIO_BASE_URL,
      model: parsed.data.LM_STUDIO_MODEL,
      temperature: parsed.data.LM_STUDIO_TEMPERATURE,
      maxTokens: parsed.data.LM_STUDIO_MAX_TOKENS
    }
  : parsed.data.LLM_PROVIDER === "ollama" ? {
      baseUrl: parsed.data.OLLAMA_BASE_URL,
      model: parsed.data.OLLAMA_MODEL,
      temperature: parsed.data.OLLAMA_TEMPERATURE,
      maxTokens: parsed.data.OLLAMA_MAX_TOKENS
    } : {
      baseUrl: parsed.data.LLAMACPP_BASE_URL,
      model: parsed.data.LLAMACPP_MODEL,
      temperature: parsed.data.OLLAMA_TEMPERATURE,
      maxTokens: parsed.data.OLLAMA_MAX_TOKENS
    };

if (!providerConfig.baseUrl || !providerConfig.model) {
  throw new Error(`Invalid environment configuration: ${parsed.data.LLM_PROVIDER} provider requires base URL and model`);
}

export const env = {
  ...parsed.data,
  API_KEY_REQUIRED: apiKeyRequired,
  AI_ENGINE_API_KEY: configuredApiKey,
  LM_STUDIO: {
    baseUrl: parsed.data.LM_STUDIO_BASE_URL ?? "http://127.0.0.1:1234",
    model: parsed.data.LM_STUDIO_MODEL ?? "qwen2.5-7b-instruct",
    temperature: parsed.data.LM_STUDIO_TEMPERATURE,
    maxTokens: parsed.data.LM_STUDIO_MAX_TOKENS
  },
  OLLAMA: {
    baseUrl: parsed.data.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434",
    model: parsed.data.OLLAMA_MODEL ?? "",
    temperature: parsed.data.OLLAMA_TEMPERATURE,
    maxTokens: parsed.data.OLLAMA_MAX_TOKENS
  },
  LLAMACPP: {
    baseUrl: parsed.data.LLAMACPP_BASE_URL,
    model: parsed.data.LLAMACPP_MODEL,
    temperature: parsed.data.OLLAMA_TEMPERATURE,
    maxTokens: parsed.data.OLLAMA_MAX_TOKENS
  }
};
