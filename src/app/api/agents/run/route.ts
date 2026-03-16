import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runAgent } from "@/ai/agents/agent.router";
import { createAgentRun } from "@/db/repositories/agent-runs.repository";
import { AppError, toErrorMessage } from "@/lib/errors";
import { enforceApiGuard } from "@/lib/api-guard";

export const runtime = "nodejs";

const runSchema = z.object({
  agent: z.enum(["lead", "landing", "proposal", "support"]),
  input: z.unknown(),
  mode: z.enum(["standard", "fast"]).default("standard")
});

export async function POST(request: NextRequest) {
  let payload: z.infer<typeof runSchema> | null = null;

  try {
    enforceApiGuard(request);
    const raw = (await request.json()) as unknown;
    payload = runSchema.parse(raw);

    const result = await runAgent(payload);
    const runId = await createAgentRun({
      agent: payload.agent,
      input: payload.input,
      result
    });

    return NextResponse.json({
      success: true,
      data: {
        runId,
        agent: result.agent,
        parsedOutput: result.parsedOutput,
        rawOutput: result.rawOutput,
        metadata: {
          mode: result.mode,
          model: result.model,
          provider: result.provider,
          attemptCount: result.attemptCount,
          durationMs: result.durationMs,
          usage: result.usage
        }
      }
    });
  } catch (error) {
    const fallbackAgent = payload?.agent ?? "unknown";
    const fallbackInput = payload?.input ?? {};

    try {
      await createAgentRun({
        agent: fallbackAgent,
        input: fallbackInput,
        errorMessage: toErrorMessage(error)
      });
    } catch {
      // ignore persistence errors in failure path
    }

    if (error instanceof AppError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: error.code,
            message: error.message,
            details: error.details
          }
        },
        { status: error.status }
      );
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "REQUEST_INVALID",
            message: "Invalid request payload",
            details: error.flatten()
          }
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          code: "UNEXPECTED_ERROR",
          message: toErrorMessage(error)
        }
      },
      { status: 500 }
    );
  }
}
