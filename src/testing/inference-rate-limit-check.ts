import assert from "node:assert/strict";
import { InferenceRateLimiter } from "@/ai/runtime/inference-rate-limiter";

async function main() {
  const limiter = new InferenceRateLimiter({ windowMs: 1000, maxRequestsPerIdentity: 2, maxGlobalRequests: 10 });
  assert.equal(limiter.consume("client-a", 0).allowed, true);
  assert.equal(limiter.consume("client-a", 10).allowed, true);
  const limited = limiter.consume("client-a", 20);
  assert.equal(limited.allowed, false);
  assert.equal(limited.reason, "identity_rate_limited");
  assert.equal(limited.retryAfterMs, 980);
  assert.equal(limiter.consume("client-b", 20).allowed, true);

  const global = new InferenceRateLimiter({ windowMs: 1000, maxRequestsPerIdentity: 10, maxGlobalRequests: 2 });
  assert.equal(global.consume("client-a", 0).allowed, true);
  assert.equal(global.consume("client-b", 1).allowed, true);
  const globallyLimited = global.consume("client-c", 2);
  assert.equal(globallyLimited.allowed, false);
  assert.equal(globallyLimited.reason, "global_rate_limited");

  const expiring = new InferenceRateLimiter({ windowMs: 1000, maxRequestsPerIdentity: 1, maxGlobalRequests: 10 });
  assert.equal(expiring.consume("client-a", 0).allowed, true);
  assert.equal(expiring.consume("client-a", 999).allowed, false);
  assert.equal(expiring.consume("client-a", 1000).allowed, true);
  expiring.consume("client-b", 1001);
  assert.equal(expiring.getBucketCount() > 0, true);
  expiring.cleanup(3000);
  assert.equal(expiring.getBucketCount(), 0);

  assert.throws(() => new InferenceRateLimiter({ windowMs: 0, maxRequestsPerIdentity: 1, maxGlobalRequests: 1 }));
  assert.throws(() => new InferenceRateLimiter({ windowMs: 1000, maxRequestsPerIdentity: 0, maxGlobalRequests: 1 }));
  assert.throws(() => new InferenceRateLimiter({ windowMs: 1000, maxRequestsPerIdentity: 1, maxGlobalRequests: 0 }));

  console.log("Inference rate limit checks passed.");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
