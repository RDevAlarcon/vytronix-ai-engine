import { NextResponse } from "next/server";
import { checkDatabaseHealth } from "@/db/repositories/agent-runs.repository";
import { env } from "@/lib/env";

export const runtime = "nodejs";

export async function GET() {
  const dbHealthy = await checkDatabaseHealth();

  const llmConfigured = env.LLM_PROVIDER === "lmstudio"
    ? Boolean(env.LM_STUDIO.baseUrl && env.LM_STUDIO.model)
    : env.LLM_PROVIDER === "ollama"
      ? Boolean(env.OLLAMA.baseUrl && env.OLLAMA.model)
      : Boolean(env.LLAMACPP.baseUrl && env.LLAMACPP.model);
  return NextResponse.json({
    status: dbHealthy && llmConfigured ? "ok" : "degraded",
    service: "ai-engine",
    database: dbHealthy ? "ok" : "error",
    llm: llmConfigured ? "ok" : "error"
  }, { status: dbHealthy && llmConfigured ? 200 : 503 });
}
