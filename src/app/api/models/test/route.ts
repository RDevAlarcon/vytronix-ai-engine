import { NextResponse } from "next/server";
import { llmService } from "@/ai/llm/llm.service";
import { AppError, toPublicError } from "@/lib/errors";
import { enforceApiGuard } from "@/lib/api-guard";
import { NextRequest } from "next/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    enforceApiGuard(request);
    const result = await llmService.chat({
      messages: [
        {
          role: "system",
          content: "You are a health-check assistant. Reply with one short sentence."
        },
        {
          role: "user",
          content: "Confirm that the local model connection is working."
        }
      ],
      maxTokens: 80,
      temperature: 0
    });

    return NextResponse.json({
      status: "ok",
      provider: result.provider,
      model: result.model,
      response: result.content
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        error: toPublicError(error)
      },
      { status: error instanceof AppError ? error.status : 503 }
    );
  }
}
