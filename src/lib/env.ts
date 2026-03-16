import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url(),
  LLM_PROVIDER: z.enum(["lmstudio"]).default("lmstudio"),
  LM_STUDIO_BASE_URL: z.url().default("http://127.0.0.1:1234"),
  LM_STUDIO_MODEL: z.string().min(1).default("qwen2.5-7b-instruct"),
  LM_STUDIO_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.2),
  LM_STUDIO_MAX_TOKENS: z.coerce.number().int().min(64).max(8192).default(1200),
  LLM_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(45000),
  API_KEY_REQUIRED: z.coerce.boolean().default(false),
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

if (parsed.data.API_KEY_REQUIRED && !parsed.data.INTERNAL_API_KEY) {
  throw new Error("Invalid environment configuration: INTERNAL_API_KEY is required when API_KEY_REQUIRED=true");
}

export const env = parsed.data;
