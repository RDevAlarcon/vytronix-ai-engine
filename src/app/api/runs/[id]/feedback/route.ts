import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updateAgentRunFeedback } from "@/db/repositories/agent-runs.repository";
import { AppError, toPublicError } from "@/lib/errors";
import { enforceApiGuard } from "@/lib/api-guard";

export const runtime = "nodejs";

const schema = z.object({
  feedbackValue: z.enum(["helpful", "unhelpful"]),
  feedbackComment: z.string().max(500).optional()
});

type RouteProps = {
  params: Promise<{ id: string }>;
};

export async function POST(request: NextRequest, { params }: RouteProps) {
  try {
    enforceApiGuard(request);
    const { id } = await params;
    const payload = schema.parse(await request.json());

    const run = await updateAgentRunFeedback({
      runId: id,
      feedbackValue: payload.feedbackValue,
      feedbackComment: payload.feedbackComment
    });

    if (!run) {
      throw new AppError("Run not found", { code: "RUN_NOT_FOUND", status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: run.id,
        feedbackValue: run.feedbackValue,
        feedbackComment: run.feedbackComment,
        feedbackAt: run.feedbackAt
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
            message: "Invalid feedback payload",
            details: error.flatten()
          }
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: false, error: toPublicError(error) }, { status: 500 });
  }
}
