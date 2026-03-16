import { NextResponse } from "next/server";
import { checkDatabaseHealth } from "@/db/repositories/agent-runs.repository";
import { env } from "@/lib/env";

export const runtime = "nodejs";

export async function GET() {
  const dbHealthy = await checkDatabaseHealth();

  return NextResponse.json({
    status: dbHealthy ? "ok" : "degraded",
    checks: {
      database: dbHealthy ? "ok" : "error",
      llm: {
        provider: env.LLM_PROVIDER,
        baseUrl: env.LM_STUDIO_BASE_URL,
        model: env.LM_STUDIO_MODEL
      }
    },
    timestamp: new Date().toISOString()
  });
}
