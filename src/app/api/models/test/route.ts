import { NextResponse } from "next/server";
import { llmService } from "@/ai/llm/llm.service";
import { toErrorMessage } from "@/lib/errors";

export const runtime = "nodejs";

export async function GET() {
  try {
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
        message: "LLM connection test failed",
        details: toErrorMessage(error)
      },
      { status: 503 }
    );
  }
}
