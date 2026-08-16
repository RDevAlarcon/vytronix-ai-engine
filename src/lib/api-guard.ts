import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { InMemoryRateLimiter } from "@/lib/rate-limiter";

const rateLimiter = new InMemoryRateLimiter(env.RATE_LIMIT_WINDOW_MS, env.RATE_LIMIT_MAX_REQUESTS);

const getClientIp = (request: NextRequest): string => {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp) {
      return firstIp;
    }
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }

  return "unknown";
};

const getRateLimitKey = (request: NextRequest): string => {
  const apiKey = request.headers.get("x-api-key");
  if (apiKey) {
    const fingerprint = createHash("sha256").update(apiKey).digest("hex");
    return `api_key:${fingerprint}`;
  }

  return `ip:${getClientIp(request)}`;
};

export const isApiKeyValid = (received: string | null, expected: string | undefined): boolean => {
  const receivedBuffer = received ? Buffer.from(received) : Buffer.alloc(0);
  const expectedBuffer = expected ? Buffer.from(expected) : Buffer.alloc(0);
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
};

const validateApiKey = (request: NextRequest): void => {
  if (!env.API_KEY_REQUIRED) {
    return;
  }

  const received = request.headers.get("x-api-key");
  const expected = env.AI_ENGINE_API_KEY;
  if (!isApiKeyValid(received, expected)) {
    throw new AppError("Unauthorized", {
      code: "UNAUTHORIZED",
      status: 401
    });
  }
};

const applyRateLimit = (request: NextRequest): void => {
  if (!env.RATE_LIMIT_ENABLED) {
    return;
  }

  const key = getRateLimitKey(request);
  if (!rateLimiter.consume(key)) {
    throw new AppError("Too many requests", {
      code: "RATE_LIMITED",
      status: 429,
      details: {
        windowMs: env.RATE_LIMIT_WINDOW_MS,
        maxRequests: env.RATE_LIMIT_MAX_REQUESTS
      }
    });
  }

};

export const enforceApiGuard = (request: NextRequest): void => {
  validateApiKey(request);
  applyRateLimit(request);
};

export const resetRateLimitForTests = (): void => {
  rateLimiter.clear();
};
