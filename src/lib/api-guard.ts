import { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";

type RateLimitEntry = {
  count: number;
  windowStart: number;
};

const rateLimitStore = new Map<string, RateLimitEntry>();

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
    return `api_key:${apiKey}`;
  }

  return `ip:${getClientIp(request)}`;
};

const validateApiKey = (request: NextRequest): void => {
  if (!env.API_KEY_REQUIRED) {
    return;
  }

  const received = request.headers.get("x-api-key");
  const expected = env.INTERNAL_API_KEY;
  if (!received || !expected || received !== expected) {
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

  const now = Date.now();
  const key = getRateLimitKey(request);
  const current = rateLimitStore.get(key);

  if (!current) {
    rateLimitStore.set(key, { count: 1, windowStart: now });
    return;
  }

  if (now - current.windowStart >= env.RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(key, { count: 1, windowStart: now });
    return;
  }

  if (current.count >= env.RATE_LIMIT_MAX_REQUESTS) {
    throw new AppError("Too many requests", {
      code: "RATE_LIMITED",
      status: 429,
      details: {
        windowMs: env.RATE_LIMIT_WINDOW_MS,
        maxRequests: env.RATE_LIMIT_MAX_REQUESTS
      }
    });
  }

  current.count += 1;
  rateLimitStore.set(key, current);
};

export const enforceApiGuard = (request: NextRequest): void => {
  validateApiKey(request);
  applyRateLimit(request);
};

