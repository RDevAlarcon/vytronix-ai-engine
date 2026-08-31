export const DEFAULT_INFERENCE_CONTEXT_SIZE_TOKENS = 2_048;
export const DEFAULT_INFERENCE_MAX_INPUT_ESTIMATED_TOKENS = 1_200;
export const DEFAULT_INFERENCE_INPUT_CHARS_PER_TOKEN = 3;
export const DEFAULT_INFERENCE_MAX_MESSAGES = 32;
export const DEFAULT_INFERENCE_MAX_MESSAGE_CHARS = 3_600;

export type InferenceInputLimits = {
  contextSizeTokens: number;
  maxInputEstimatedTokens: number;
  inputCharsPerToken: number;
  maxCompletionTokens: number;
  maxMessages: number;
  maxMessageChars: number;
};

export type InferenceInputValidationResult =
  | { ok: true; estimatedTokens: number; totalChars: number }
  | { ok: false; status: number; code: string; message: string; estimatedTokens: number | null; totalChars: number };

type ChatMessage = {
  role?: unknown;
  content?: unknown;
};

export function estimateTextTokens(text: string, charsPerToken = DEFAULT_INFERENCE_INPUT_CHARS_PER_TOKEN): number {
  if (text.length === 0) return 0;
  return Math.ceil(text.length / charsPerToken);
}

export function validateInferenceInput(payload: Record<string, unknown>, limits: InferenceInputLimits): InferenceInputValidationResult {
  validateInputLimits(limits);

  const messages = payload.messages;
  if (!Array.isArray(messages)) {
    return failure("INVALID_MESSAGES", "messages must be an array", 400, null, 0);
  }
  if (messages.length > limits.maxMessages) {
    return failure("TOO_MANY_MESSAGES", "Too many messages", 413, null, 0);
  }

  let totalChars = 0;
  for (const message of messages) {
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      return failure("INVALID_MESSAGE", "Each message must be an object", 400, null, totalChars);
    }

    const content = (message as ChatMessage).content;
    if (typeof content !== "string") {
      return failure("UNSUPPORTED_MESSAGE_CONTENT", "Only textual message content is supported", 400, null, totalChars);
    }

    if (content.length > limits.maxMessageChars) {
      return failure("MESSAGE_TOO_LARGE", "Message is too large", 413, estimateTextTokens(content, limits.inputCharsPerToken), totalChars + content.length);
    }
    totalChars += content.length;
  }

  const estimatedTokens = estimateTextTokens("x".repeat(totalChars), limits.inputCharsPerToken);
  if (estimatedTokens > limits.maxInputEstimatedTokens) {
    return failure("INFERENCE_INPUT_TOO_LARGE", "Inference input is too large", 413, estimatedTokens, totalChars);
  }

  return { ok: true, estimatedTokens, totalChars };
}

export function validateInputLimits(limits: InferenceInputLimits): void {
  const integers = [
    limits.contextSizeTokens,
    limits.maxInputEstimatedTokens,
    limits.inputCharsPerToken,
    limits.maxCompletionTokens,
    limits.maxMessages,
    limits.maxMessageChars
  ];
  if (!integers.every((value) => Number.isSafeInteger(value) && value > 0)) {
    throw new Error("Inference input limits must be positive integers");
  }
  if (limits.maxInputEstimatedTokens + limits.maxCompletionTokens >= limits.contextSizeTokens) {
    throw new Error("Inference input and completion limits must leave context margin");
  }
}

function failure(code: string, message: string, status: number, estimatedTokens: number | null, totalChars: number): InferenceInputValidationResult {
  return { ok: false, status, code, message, estimatedTokens, totalChars };
}
