import { z } from "zod";
import type { ToolDefinition } from "@/ai/tools/tool-contract";
import { validateToolCall } from "@/ai/tools/tool-contract";
import { executeStructuredOutput } from "@/ai/structured-output/structured-output";
import { llmService } from "@/ai/llm/llm.service";
import { AppError } from "@/lib/errors";

export type ToolArgumentExtractionResult = {
  status: "SUCCESS" | "MISSING_INFORMATION" | "INVALID";
  arguments?: Record<string, unknown>;
  missing?: string[];
  attempts: number;
  repairAttempt: boolean;
  durationMs: number;
};

export const extractToolArguments = async (params: { input: unknown; tool: ToolDefinition }): Promise<ToolArgumentExtractionResult> => {
  const startedAt = Date.now();
  const schema = z.record(z.string(), z.unknown());
  try {
    const execution = await executeStructuredOutput({
      baseMessages: [{ role: "system", content: [
        "You extract only arguments for the selected tool.",
        "Return only a JSON object matching the tool input schema.",
        "Do not return action, tool name, explanation, or reasoning.",
        `Selected tool: ${params.tool.name}`,
        `Tool description: ${params.tool.description}`,
        `Tool input schema: ${JSON.stringify(params.tool.inputSchema)}`,
        `User input: ${JSON.stringify(params.input)}`
      ].join("\n") }],
      schema,
      schemaDescription: params.tool.inputSchema,
      generate: (messages) => llmService.chat({
        messages,
        temperature: 0,
        maxTokens: 180,
        responseSchema: llmService.supportsStructuredOutput ? params.tool.inputSchema : undefined
      }),
      captureRawOutput: process.env.TOOL_DIAGNOSTICS_CAPTURE_RAW_OUTPUT === "true",
      validate: (argumentsValue) => validateToolCall({ name: params.tool.name, arguments: argumentsValue, requiresConfirmation: params.tool.requiresConfirmation }, [params.tool]),
      repairInstructions: "Return ONLY an object matching the selected Tool input schema. Do not return RESPOND, CALL_TOOL, or reasoning. Do not invent required values."
    });
    return { status: "SUCCESS", arguments: execution.parsedOutput, attempts: execution.attemptCount, repairAttempt: execution.repairAttempt, durationMs: Date.now() - startedAt };
  } catch (error) {
    if (error instanceof AppError && error.code === "TOOL_ARGUMENTS_INVALID") {
      const details = error.details as Record<string, unknown> | undefined;
      const reason = typeof details?.reason === "string" ? details.reason : error.message;
      const missing = [...reason.matchAll(/(?:arguments\.)?([a-zA-Z0-9_]+) is required/g)].map((match) => match[1]).filter((value): value is string => Boolean(value));
      return { status: missing.length ? "MISSING_INFORMATION" : "INVALID", missing, attempts: 2, repairAttempt: true, durationMs: Date.now() - startedAt };
    }
    throw error;
  }
};
