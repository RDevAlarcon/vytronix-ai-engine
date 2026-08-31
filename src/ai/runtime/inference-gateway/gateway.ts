import http from "node:http";
import type { AddressInfo } from "node:net";
import { DEFAULT_INFERENCE_CONTEXT_SIZE_TOKENS, DEFAULT_INFERENCE_INPUT_CHARS_PER_TOKEN, DEFAULT_INFERENCE_MAX_INPUT_ESTIMATED_TOKENS, DEFAULT_INFERENCE_MAX_MESSAGE_CHARS, DEFAULT_INFERENCE_MAX_MESSAGES, validateInferenceInput } from "../inference-input-limits";
import { InferenceQueue, InferenceQueueAbortedError, InferenceQueueFullError, InferenceQueueTimeoutError } from "../inference-queue";
import { InferenceRateLimiter, type InferenceRateLimitResult } from "../inference-rate-limiter";
import { DEFAULT_MIN_AVAILABLE_MEMORY_MB, ProductionMemoryGate, type MemoryGateResult } from "../memory-gate";
import { DEFAULT_THERMAL_HARD_THRESHOLD_C, DEFAULT_THERMAL_MAX_WAIT_MS, DEFAULT_THERMAL_RECHECK_MS, DEFAULT_THERMAL_RESUME_THRESHOLD_C, DEFAULT_THERMAL_START_THRESHOLD_C, ProductionThermalGate, type ThermalGateResult } from "../thermal-gate";
import { createGatewayDeadline, type GatewayDeadline } from "./deadline";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length"
]);

export const DEFAULT_INFERENCE_GATEWAY_HOST = "127.0.0.1";
export const DEFAULT_INFERENCE_GATEWAY_PORT = 18_081;
export const DEFAULT_LLAMACPP_UPSTREAM_URL = "http://127.0.0.1:8081";
export const DEFAULT_INFERENCE_GATEWAY_BODY_LIMIT_BYTES = 128 * 1024;
export const DEFAULT_INFERENCE_GATEWAY_UPSTREAM_TIMEOUT_MS = 90_000;
export const DEFAULT_INFERENCE_GATEWAY_QUEUE_TIMEOUT_MS = 30_000;
export const DEFAULT_INFERENCE_GATEWAY_TOTAL_TIMEOUT_MS = 120_000;
export const DEFAULT_INFERENCE_RATE_LIMIT_WINDOW_MS = 60_000;
export const DEFAULT_INFERENCE_RATE_LIMIT_MAX_REQUESTS = 10;
export const DEFAULT_INFERENCE_GLOBAL_RATE_LIMIT_MAX_REQUESTS = 20;
export const DEFAULT_INFERENCE_MAX_COMPLETION_TOKENS = 550;

export type GatewayLogger = {
  info?: (message: string, context?: Record<string, unknown>) => void;
  warn?: (message: string, context?: Record<string, unknown>) => void;
  error?: (message: string, context?: Record<string, unknown>) => void;
};

export type InferenceGatewayConfig = {
  host?: string;
  port?: number;
  upstreamUrl?: string;
  bodyLimitBytes?: number;
  upstreamTimeoutMs?: number;
  queueTimeoutMs?: number;
  totalTimeoutMs?: number;
  rateLimitWindowMs?: number;
  rateLimitMaxRequests?: number;
  globalRateLimitMaxRequests?: number;
  maxCompletionTokens?: number;
  contextSizeTokens?: number;
  maxInputEstimatedTokens?: number;
  inputCharsPerToken?: number;
  maxMessages?: number;
  maxMessageChars?: number;
  retryAfterSeconds?: number;
  thermalRetryAfterSeconds?: number;
};

export type InferenceGatewayDependencies = {
  queue?: InferenceQueue;
  memoryGate?: Pick<ProductionMemoryGate, "check">;
  thermalGate?: Pick<ProductionThermalGate, "waitUntilSafe">;
  rateLimiter?: Pick<InferenceRateLimiter, "consume">;
  fetch?: typeof fetch;
  now?: () => number;
  logger?: GatewayLogger;
};

export type InferenceGatewayCounters = {
  received: number;
  queued: number;
  completed: number;
  inputRejected: number;
  memoryAllowed: number;
  memoryBlocked: number;
  thermalAllowed: number;
  thermalBlocked: number;
  forwarded: number;
  queueRejected: number;
  rateLimited: number;
  globalRateLimited: number;
  totalTimeouts: number;
  badRequests: number;
  upstreamTimeouts: number;
  upstreamErrors: number;
  aborted: number;
};

type GatewayRuntimeConfig = Required<InferenceGatewayConfig>;

type BodyReadResult =
  | { ok: true; body: Buffer }
  | { ok: false; status: number; code: string; message: string };

type NormalizedBodyResult =
  | { ok: true; body: Buffer; estimatedInputTokens: number; totalInputChars: number }
  | { ok: false; status: number; code: string; message: string; estimatedInputTokens: number | null; totalInputChars: number };

export function createInferenceGateway(config: InferenceGatewayConfig = {}, dependencies: InferenceGatewayDependencies = {}) {
  const runtimeConfig: GatewayRuntimeConfig = {
    host: config.host ?? DEFAULT_INFERENCE_GATEWAY_HOST,
    port: config.port ?? DEFAULT_INFERENCE_GATEWAY_PORT,
    upstreamUrl: trimTrailingSlash(config.upstreamUrl ?? DEFAULT_LLAMACPP_UPSTREAM_URL),
    bodyLimitBytes: config.bodyLimitBytes ?? DEFAULT_INFERENCE_GATEWAY_BODY_LIMIT_BYTES,
    upstreamTimeoutMs: config.upstreamTimeoutMs ?? DEFAULT_INFERENCE_GATEWAY_UPSTREAM_TIMEOUT_MS,
    queueTimeoutMs: config.queueTimeoutMs ?? DEFAULT_INFERENCE_GATEWAY_QUEUE_TIMEOUT_MS,
    totalTimeoutMs: config.totalTimeoutMs ?? DEFAULT_INFERENCE_GATEWAY_TOTAL_TIMEOUT_MS,
    rateLimitWindowMs: config.rateLimitWindowMs ?? DEFAULT_INFERENCE_RATE_LIMIT_WINDOW_MS,
    rateLimitMaxRequests: config.rateLimitMaxRequests ?? DEFAULT_INFERENCE_RATE_LIMIT_MAX_REQUESTS,
    globalRateLimitMaxRequests: config.globalRateLimitMaxRequests ?? DEFAULT_INFERENCE_GLOBAL_RATE_LIMIT_MAX_REQUESTS,
    maxCompletionTokens: config.maxCompletionTokens ?? DEFAULT_INFERENCE_MAX_COMPLETION_TOKENS,
    contextSizeTokens: config.contextSizeTokens ?? DEFAULT_INFERENCE_CONTEXT_SIZE_TOKENS,
    maxInputEstimatedTokens: config.maxInputEstimatedTokens ?? DEFAULT_INFERENCE_MAX_INPUT_ESTIMATED_TOKENS,
    inputCharsPerToken: config.inputCharsPerToken ?? DEFAULT_INFERENCE_INPUT_CHARS_PER_TOKEN,
    maxMessages: config.maxMessages ?? DEFAULT_INFERENCE_MAX_MESSAGES,
    maxMessageChars: config.maxMessageChars ?? DEFAULT_INFERENCE_MAX_MESSAGE_CHARS,
    retryAfterSeconds: config.retryAfterSeconds ?? 5,
    thermalRetryAfterSeconds: config.thermalRetryAfterSeconds ?? 5
  };

  validateConfig(runtimeConfig);

  const queue = dependencies.queue ?? new InferenceQueue(5, runtimeConfig.queueTimeoutMs);
  const rateLimiter = dependencies.rateLimiter ?? new InferenceRateLimiter({
    windowMs: runtimeConfig.rateLimitWindowMs,
    maxRequestsPerIdentity: runtimeConfig.rateLimitMaxRequests,
    maxGlobalRequests: runtimeConfig.globalRateLimitMaxRequests
  });
  const memoryGate = dependencies.memoryGate ?? new ProductionMemoryGate(DEFAULT_MIN_AVAILABLE_MEMORY_MB);
  const thermalGate = dependencies.thermalGate ?? new ProductionThermalGate({
    enabled: true,
    startThresholdC: DEFAULT_THERMAL_START_THRESHOLD_C,
    resumeThresholdC: DEFAULT_THERMAL_RESUME_THRESHOLD_C,
    hardThresholdC: DEFAULT_THERMAL_HARD_THRESHOLD_C,
    recheckMs: DEFAULT_THERMAL_RECHECK_MS,
    maxWaitMs: DEFAULT_THERMAL_MAX_WAIT_MS
  });
  const fetchImpl = dependencies.fetch ?? fetch;
  const now = dependencies.now ?? Date.now;
  const logger = dependencies.logger ?? {};
  const counters: InferenceGatewayCounters = {
    received: 0,
    queued: 0,
    completed: 0,
    inputRejected: 0,
    memoryAllowed: 0,
    memoryBlocked: 0,
    thermalAllowed: 0,
    thermalBlocked: 0,
    forwarded: 0,
    queueRejected: 0,
    rateLimited: 0,
    globalRateLimited: 0,
    totalTimeouts: 0,
    badRequests: 0,
    upstreamTimeouts: 0,
    upstreamErrors: 0,
    aborted: 0
  };

  const server = http.createServer(async (request, response) => {
    try {
      if (request.method === "GET" && request.url === "/health") {
        writeJson(response, 200, {
          status: "ok",
          queue: snapshot(queue),
          limits: {
            contextSizeTokens: runtimeConfig.contextSizeTokens,
            maxInputEstimatedTokens: runtimeConfig.maxInputEstimatedTokens,
            maxCompletionTokens: runtimeConfig.maxCompletionTokens
          },
          counters: publicCounters(counters)
        });
        return;
      }

      if (request.url !== "/v1/chat/completions") {
        writeJson(response, 404, { error: { code: "NOT_FOUND", message: "Unsupported route" } });
        return;
      }

      if (request.method !== "POST") {
        writeJson(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "Use POST for this endpoint" } }, { allow: "POST" });
        return;
      }

      const clientAbort = createClientAbortController(request);
      const deadline = createGatewayDeadline({ clientSignal: clientAbort.signal, timeoutMs: runtimeConfig.totalTimeoutMs, now });
      try {
        const body = await readLimitedBody(request, runtimeConfig.bodyLimitBytes);
        if (!body.ok) {
          writeJson(response, body.status, { error: { code: body.code, message: body.message } });
          return;
        }

        const normalized = normalizeChatCompletionBody(request, body.body, runtimeConfig);
        if (!normalized.ok) {
          counters.badRequests += 1;
          if (normalized.status === 413) counters.inputRejected += 1;
          writeJson(response, normalized.status, { error: { code: normalized.code, message: normalized.message } });
          return;
        }

        if (deadline.signal.aborted || deadline.remainingMs() <= 0) {
          writeGatewayResponse(response, totalTimeoutResponse(counters));
          return;
        }

        const rateLimit = rateLimiter.consume(getRateLimitIdentity(request), now());
        if (!rateLimit.allowed) {
          if (rateLimit.reason === "global_rate_limited") counters.globalRateLimited += 1;
          else counters.rateLimited += 1;
          writeRateLimitResponse(response, rateLimit);
          return;
        }

        counters.received += 1;
        counters.queued += 1;
        const result = await queue.run(
          (queueSignal) => forwardAfterMemoryGate({
            body: normalized.body,
            request,
            deadline,
            queueSignal,
            config: runtimeConfig,
            memoryGate,
            thermalGate,
            fetchImpl,
            counters,
            logger
          }),
          { signal: deadline.signal, queueTimeoutMs: Math.min(runtimeConfig.queueTimeoutMs, Math.max(0, deadline.remainingMs())) }
        );
        if (result.ok) counters.completed += 1;
        writeGatewayResponse(response, result);
      } catch (error) {
        writeQueueOrInternalError(response, error, runtimeConfig.retryAfterSeconds, counters, logger, deadline.reason());
      } finally {
        deadline.dispose();
      }
    } catch (error) {
      writeQueueOrInternalError(response, error, runtimeConfig.retryAfterSeconds, counters, logger);
    }
  });

  return {
    server,
    counters,
    config: runtimeConfig,
    getSnapshot: () => snapshot(queue),
    listen: (port = runtimeConfig.port, host = runtimeConfig.host) => new Promise<number>((resolve) => {
      server.listen(port, host, () => resolve((server.address() as AddressInfo).port));
    }),
    close: () => new Promise<void>((resolve, reject) => {
      server.closeAllConnections();
      server.close((error) => error ? reject(error) : resolve());
    })
  };
}

async function forwardAfterMemoryGate(input: {
  body: Buffer;
  request: http.IncomingMessage;
  deadline: GatewayDeadline;
  queueSignal: AbortSignal;
  config: GatewayRuntimeConfig;
  memoryGate: Pick<ProductionMemoryGate, "check">;
  thermalGate: Pick<ProductionThermalGate, "waitUntilSafe">;
  fetchImpl: typeof fetch;
  counters: InferenceGatewayCounters;
  logger: GatewayLogger;
}): Promise<Response> {
  if (input.deadline.signal.aborted || input.deadline.remainingMs() <= 0) return totalTimeoutResponse(input.counters);
  const memory = await input.memoryGate.check();
  logMemoryGate(input.logger, memory);

  if (!memory.allowed) {
    input.counters.memoryBlocked += 1;
    return jsonResponse(503, {
      error: {
        code: "INFERENCE_MEMORY_UNAVAILABLE",
        message: "Inference is temporarily unavailable"
      }
    });
  }

  input.counters.memoryAllowed += 1;
  if (input.deadline.signal.aborted || input.deadline.remainingMs() <= 0) return totalTimeoutResponse(input.counters);
  const thermal = await input.thermalGate.waitUntilSafe({ signal: input.deadline.signal, maxWaitMs: input.deadline.remainingMs() });
  logThermalGate(input.logger, thermal);
  if (!thermal.allowed) {
    input.counters.thermalBlocked += 1;
    if (input.deadline.reason() === "total_timeout") return totalTimeoutResponse(input.counters);
    if (thermal.reason === "aborted") {
      input.counters.aborted += 1;
      return jsonResponse(499, { error: { code: "CLIENT_ABORTED", message: "Inference request was aborted" } });
    }
    return jsonResponse(503, {
      error: {
        code: "INFERENCE_THERMAL_UNAVAILABLE",
        message: "Inference is temporarily unavailable"
      }
    }, { "retry-after": String(input.config.thermalRetryAfterSeconds) });
  }

  input.counters.thermalAllowed += 1;
  input.counters.forwarded += 1;
  return forwardUpstream(input);
}

async function forwardUpstream(input: {
  body: Buffer;
  request: http.IncomingMessage;
  deadline: GatewayDeadline;
  queueSignal: AbortSignal;
  config: GatewayRuntimeConfig;
  fetchImpl: typeof fetch;
  counters: InferenceGatewayCounters;
}): Promise<Response> {
  if (input.deadline.signal.aborted || input.deadline.remainingMs() <= 0) return totalTimeoutResponse(input.counters);
  const upstreamAbort = new AbortController();
  const effectiveTimeoutMs = Math.min(input.config.upstreamTimeoutMs, input.deadline.remainingMs());
  const timeoutReason = effectiveTimeoutMs < input.config.upstreamTimeoutMs ? "total_timeout" : "upstream_timeout";
  const timeout = setTimeout(() => upstreamAbort.abort(new DOMException(timeoutReason, "TimeoutError")), effectiveTimeoutMs);
  const abortUpstream = () => upstreamAbort.abort(new DOMException("Gateway request aborted", "AbortError"));
  input.queueSignal.addEventListener("abort", abortUpstream, { once: true });
  input.deadline.signal.addEventListener("abort", abortUpstream, { once: true });

  try {
    const upstreamResponse = await input.fetchImpl(`${input.config.upstreamUrl}/v1/chat/completions`, {
      method: "POST",
      headers: filterForwardHeaders(input.request.headers),
      body: new Uint8Array(input.body),
      signal: upstreamAbort.signal
    });
    return upstreamResponse;
  } catch {
    if (upstreamAbort.signal.aborted) {
      if (input.deadline.reason() === "total_timeout") return totalTimeoutResponse(input.counters);
      const reason = upstreamAbort.signal.reason;
      if (reason instanceof DOMException && reason.message === "total_timeout") {
        return totalTimeoutResponse(input.counters);
      }
      if (reason instanceof DOMException && reason.name === "TimeoutError") {
        input.counters.upstreamTimeouts += 1;
        return jsonResponse(504, { error: { code: "UPSTREAM_TIMEOUT", message: "Upstream inference timed out" } });
      }
      input.counters.aborted += 1;
      return jsonResponse(499, { error: { code: "CLIENT_ABORTED", message: "Inference request was aborted" } });
    }
    input.counters.upstreamErrors += 1;
    return jsonResponse(502, { error: { code: "UPSTREAM_UNAVAILABLE", message: "Upstream inference server is unavailable" } });
  } finally {
    clearTimeout(timeout);
    input.queueSignal.removeEventListener("abort", abortUpstream);
    input.deadline.signal.removeEventListener("abort", abortUpstream);
  }
}

function readLimitedBody(request: http.IncomingMessage, limitBytes: number): Promise<BodyReadResult> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let resolved = false;
    let tooLarge = false;

    const finish = (result: BodyReadResult) => {
      if (resolved) return;
      resolved = true;
      request.removeAllListeners("data");
      request.removeAllListeners("end");
      request.removeAllListeners("error");
      resolve(result);
    };

    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > limitBytes) {
        tooLarge = true;
        return;
      }
      if (!tooLarge) chunks.push(Buffer.from(chunk));
    });
    request.on("end", () => {
      if (tooLarge) {
        finish({ ok: false, status: 413, code: "PAYLOAD_TOO_LARGE", message: "Request body is too large" });
        return;
      }
      finish({ ok: true, body: Buffer.concat(chunks) });
    });
    request.on("error", () => finish({ ok: false, status: 400, code: "REQUEST_BODY_ERROR", message: "Unable to read request body" }));
  });
}

function normalizeChatCompletionBody(request: http.IncomingMessage, body: Buffer, config: GatewayRuntimeConfig): NormalizedBodyResult {
  const contentType = request.headers["content-type"];
  if (typeof contentType === "string" && !contentType.toLowerCase().includes("application/json")) {
    return { ok: false, status: 400, code: "INVALID_CONTENT_TYPE", message: "Content-Type must be application/json", estimatedInputTokens: null, totalInputChars: 0 };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body.toString("utf8"));
  } catch {
    return { ok: false, status: 400, code: "INVALID_JSON", message: "Request body must be valid JSON", estimatedInputTokens: null, totalInputChars: 0 };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, status: 400, code: "INVALID_JSON", message: "Request body must be a JSON object", estimatedInputTokens: null, totalInputChars: 0 };
  }

  const payload = parsed as Record<string, unknown>;
  const input = validateInferenceInput(payload, {
    contextSizeTokens: config.contextSizeTokens,
    maxInputEstimatedTokens: config.maxInputEstimatedTokens,
    inputCharsPerToken: config.inputCharsPerToken,
    maxCompletionTokens: config.maxCompletionTokens,
    maxMessages: config.maxMessages,
    maxMessageChars: config.maxMessageChars
  });
  if (!input.ok) {
    return {
      ok: false,
      status: input.status,
      code: input.code,
      message: input.message,
      estimatedInputTokens: input.estimatedTokens,
      totalInputChars: input.totalChars
    };
  }

  const requested = payload.max_tokens;
  if (requested !== undefined && (typeof requested !== "number" || !Number.isSafeInteger(requested) || requested <= 0)) {
    return { ok: false, status: 400, code: "INVALID_MAX_TOKENS", message: "max_tokens must be a positive integer", estimatedInputTokens: input.estimatedTokens, totalInputChars: input.totalChars };
  }

  const normalizedMaxTokens = requested === undefined ? config.maxCompletionTokens : Math.min(requested, config.maxCompletionTokens);
  return {
    ok: true,
    body: Buffer.from(JSON.stringify({ ...payload, max_tokens: normalizedMaxTokens }), "utf8"),
    estimatedInputTokens: input.estimatedTokens,
    totalInputChars: input.totalChars
  };
}

function writeGatewayResponse(response: http.ServerResponse, upstreamResponse: Response): void {
  const headers: Record<string, string> = {};
  upstreamResponse.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) headers[key] = value;
  });
  response.writeHead(upstreamResponse.status, headers);
  upstreamResponse.arrayBuffer()
    .then((body) => response.end(Buffer.from(body)))
    .catch(() => {
      if (!response.headersSent) writeJson(response, 502, { error: { code: "UPSTREAM_RESPONSE_ERROR", message: "Unable to read upstream response" } });
      else response.end();
    });
}

function writeQueueOrInternalError(response: http.ServerResponse, error: unknown, retryAfterSeconds: number, counters: InferenceGatewayCounters, logger: GatewayLogger, abortReason: "client_aborted" | "total_timeout" | null = null): void {
  if (error instanceof InferenceQueueFullError) {
    counters.queueRejected += 1;
    writeJson(response, 503, { error: { code: error.code, message: "Inference queue is full" } }, { "retry-after": String(retryAfterSeconds) });
    return;
  }
  if (error instanceof InferenceQueueTimeoutError) {
    writeJson(response, 503, { error: { code: error.code, message: "Inference queue wait timed out" } }, { "retry-after": String(retryAfterSeconds) });
    return;
  }
  if (error instanceof InferenceQueueAbortedError) {
    if (abortReason === "total_timeout") {
      counters.totalTimeouts += 1;
      writeJson(response, 504, { error: { code: "TOTAL_TIMEOUT", message: "Inference request timed out" } });
      return;
    }
    counters.aborted += 1;
    writeJson(response, 499, { error: { code: error.code, message: "Inference request was aborted" } });
    return;
  }
  logger.error?.("inference_gateway_unhandled_error");
  writeJson(response, 500, { error: { code: "INFERENCE_GATEWAY_ERROR", message: "Inference gateway failed" } });
}

function writeRateLimitResponse(response: http.ServerResponse, rateLimit: InferenceRateLimitResult): void {
  writeJson(response, 429, { error: { code: rateLimit.reason.toUpperCase(), message: "Too many inference requests" } }, {
    "retry-after": String(Math.max(1, Math.ceil(rateLimit.retryAfterMs / 1000)))
  });
}

function filterForwardHeaders(headers: http.IncomingHttpHeaders): Headers {
  const output = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase()) || value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) output.append(key, item);
    } else {
      output.set(key, value);
    }
  }
  return output;
}

function writeJson(response: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  response.writeHead(status, { "content-type": "application/json", ...headers });
  response.end(JSON.stringify(body));
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

function createClientAbortController(request: http.IncomingMessage): AbortController {
  const controller = new AbortController();
  request.on("aborted", () => controller.abort(new DOMException("Client aborted request", "AbortError")));
  request.on("close", () => {
    if (!request.complete && !controller.signal.aborted) {
      controller.abort(new DOMException("Client closed request", "AbortError"));
    }
  });
  return controller;
}

function getRateLimitIdentity(request: http.IncomingMessage): string {
  return request.socket.remoteAddress ?? "unknown";
}

function totalTimeoutResponse(counters: InferenceGatewayCounters): Response {
  counters.totalTimeouts += 1;
  return jsonResponse(504, { error: { code: "TOTAL_TIMEOUT", message: "Inference request timed out" } });
}

function publicCounters(counters: InferenceGatewayCounters) {
  return {
    requestsAccepted: counters.received,
    requestsRejectedInput: counters.inputRejected,
    requestsRateLimited: counters.rateLimited + counters.globalRateLimited,
    queueRejected: counters.queueRejected,
    memoryRejected: counters.memoryBlocked,
    thermalRejected: counters.thermalBlocked,
    upstreamFailures: counters.upstreamErrors + counters.upstreamTimeouts,
    totalTimeouts: counters.totalTimeouts,
    completed: counters.completed
  };
}

function snapshot(queue: InferenceQueue) {
  const state = queue.getSnapshot();
  return { active: state.activeCount, depth: state.queueDepth };
}

function logMemoryGate(logger: GatewayLogger, memory: MemoryGateResult): void {
  const level = memory.allowed ? "info" : "warn";
  logger[level]?.("inference_gateway_memory_gate", {
    allowed: memory.allowed,
    availableMb: memory.availableMb,
    thresholdMb: memory.thresholdMb,
    reason: memory.reason
  });
}

function logThermalGate(logger: GatewayLogger, thermal: ThermalGateResult): void {
  const level = thermal.allowed ? "info" : "warn";
  logger[level]?.("inference_gateway_thermal_gate", {
    allowed: thermal.allowed,
    temperatureC: thermal.temperatureC,
    startThresholdC: thermal.startThresholdC,
    resumeThresholdC: thermal.resumeThresholdC,
    hardThresholdC: thermal.hardThresholdC,
    waitedMs: thermal.waitedMs,
    reason: thermal.reason
  });
}

function validateConfig(config: GatewayRuntimeConfig): void {
  if (!Number.isSafeInteger(config.port) || config.port <= 0 || config.port > 65_535) throw new Error("Invalid inference gateway port");
  if (!Number.isSafeInteger(config.bodyLimitBytes) || config.bodyLimitBytes <= 0) throw new Error("Invalid inference gateway body limit");
  if (!Number.isSafeInteger(config.upstreamTimeoutMs) || config.upstreamTimeoutMs <= 0) throw new Error("Invalid inference gateway upstream timeout");
  if (!Number.isSafeInteger(config.queueTimeoutMs) || config.queueTimeoutMs <= 0) throw new Error("Invalid inference gateway queue timeout");
  if (!Number.isSafeInteger(config.totalTimeoutMs) || config.totalTimeoutMs <= 0) throw new Error("Invalid inference gateway total timeout");
  if (!Number.isSafeInteger(config.rateLimitWindowMs) || config.rateLimitWindowMs <= 0) throw new Error("Invalid inference gateway rate limit window");
  if (!Number.isSafeInteger(config.rateLimitMaxRequests) || config.rateLimitMaxRequests <= 0) throw new Error("Invalid inference gateway identity rate limit");
  if (!Number.isSafeInteger(config.globalRateLimitMaxRequests) || config.globalRateLimitMaxRequests <= 0) throw new Error("Invalid inference gateway global rate limit");
  if (!Number.isSafeInteger(config.maxCompletionTokens) || config.maxCompletionTokens <= 0) throw new Error("Invalid inference gateway max completion tokens");
  if (!Number.isSafeInteger(config.contextSizeTokens) || config.contextSizeTokens <= 0) throw new Error("Invalid inference gateway context size");
  if (!Number.isSafeInteger(config.maxInputEstimatedTokens) || config.maxInputEstimatedTokens <= 0) throw new Error("Invalid inference gateway input token budget");
  if (!Number.isSafeInteger(config.inputCharsPerToken) || config.inputCharsPerToken <= 0) throw new Error("Invalid inference gateway input chars per token");
  if (!Number.isSafeInteger(config.maxMessages) || config.maxMessages <= 0) throw new Error("Invalid inference gateway max messages");
  if (!Number.isSafeInteger(config.maxMessageChars) || config.maxMessageChars <= 0) throw new Error("Invalid inference gateway max message chars");
  if (config.maxInputEstimatedTokens + config.maxCompletionTokens >= config.contextSizeTokens) throw new Error("Inference gateway input and completion limits must leave context margin");
  const upstream = new URL(config.upstreamUrl);
  if (upstream.protocol !== "http:" && upstream.protocol !== "https:") throw new Error("Invalid inference gateway upstream protocol");
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

