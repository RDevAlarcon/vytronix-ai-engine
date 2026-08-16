import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { classifyAgentScope } from "@/ai/agents/intent.classifier";
import { enforceApiGuard } from "@/lib/api-guard";
import { AppError, toPublicError } from "@/lib/errors";
import { assertRequestBodySize } from "@/lib/request-limits";

export const runtime = "nodejs";

const classifySchema = z.object({
  agent: z.enum(["lead", "landing", "proposal", "support"]),
  input: z.unknown()
});

export async function POST(request: NextRequest) {
  try {
    enforceApiGuard(request);
    const raw = (await request.json()) as unknown;
    assertRequestBodySize(raw, request.headers.get("content-length"));
    const payload = classifySchema.parse(raw);
    const result = classifyAgentScope(payload.agent, payload.input);

    return NextResponse.json({
      success: true,
      data: {
        agent: payload.agent,
        inScope: result.inScope,
        confidence: result.confidence,
        reason: result.reason
      }
    });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json(
        { success: false, error: toPublicError(error) },
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

    return NextResponse.json({ success: false, error: toPublicError(error) }, { status: 500 });
  }
}
