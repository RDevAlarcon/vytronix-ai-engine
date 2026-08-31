import assert from "node:assert/strict";
import { DEFAULT_INFERENCE_INPUT_CHARS_PER_TOKEN, estimateTextTokens, validateInferenceInput, validateInputLimits, type InferenceInputLimits } from "@/ai/runtime/inference-input-limits";

const limits: InferenceInputLimits = {
  contextSizeTokens: 2048,
  maxInputEstimatedTokens: 1200,
  inputCharsPerToken: 3,
  maxCompletionTokens: 550,
  maxMessages: 32,
  maxMessageChars: 3600
};

function message(content: string) {
  return { role: "user", content };
}

function assertCode(result: ReturnType<typeof validateInferenceInput>, code: string): void {
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, code);
}

async function main() {
  assert.equal(estimateTextTokens(""), 0);
  assert.equal(estimateTextTokens("abc", DEFAULT_INFERENCE_INPUT_CHARS_PER_TOKEN), 1);
  assert.equal(estimateTextTokens("abcd", DEFAULT_INFERENCE_INPUT_CHARS_PER_TOKEN), 2);
  assert.equal(estimateTextTokens("x".repeat(3600), 3), 1200);

  assert.equal(validateInferenceInput({ messages: [message("hola")] }, limits).ok, true);
  assert.deepEqual(validateInferenceInput({ messages: [message("x".repeat(3600))] }, limits), { ok: true, estimatedTokens: 1200, totalChars: 3600 });
  const tooLarge = validateInferenceInput({ messages: [message("x".repeat(3601))] }, { ...limits, maxMessageChars: 5000 });
  assert.equal(tooLarge.ok, false);
  assert.equal(tooLarge.status, 413);
  assert.equal(tooLarge.code, "INFERENCE_INPUT_TOO_LARGE");

  const summed = validateInferenceInput({ messages: [{ role: "system", content: "x".repeat(1800) }, { role: "user", content: "y".repeat(1800) }] }, limits);
  assert.deepEqual(summed, { ok: true, estimatedTokens: 1200, totalChars: 3600 });

  assertCode(validateInferenceInput({ messages: [message("x".repeat(3601))] }, limits), "MESSAGE_TOO_LARGE");
  assertCode(validateInferenceInput({ messages: Array.from({ length: 33 }, () => message("x")) }, limits), "TOO_MANY_MESSAGES");
  assertCode(validateInferenceInput({ messages: [{ role: "user", content: [{ type: "text", text: "x" }] }] }, limits), "UNSUPPORTED_MESSAGE_CONTENT");
  assertCode(validateInferenceInput({ messages: [{ role: "user" }] }, limits), "UNSUPPORTED_MESSAGE_CONTENT");
  assertCode(validateInferenceInput({ messages: "hello" }, limits), "INVALID_MESSAGES");
  assertCode(validateInferenceInput({ messages: [null] }, limits), "INVALID_MESSAGE");

  assert.doesNotThrow(() => validateInputLimits(limits));
  assert.throws(() => validateInputLimits({ ...limits, maxInputEstimatedTokens: 1498 }));
  assert.throws(() => validateInputLimits({ ...limits, inputCharsPerToken: 0 }));

  console.log("Inference input checks passed.");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
