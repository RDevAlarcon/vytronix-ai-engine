export type InferenceRateLimitResult =
  | { allowed: true; retryAfterMs: 0; reason: "ok" }
  | { allowed: false; retryAfterMs: number; reason: "identity_rate_limited" | "global_rate_limited" };

type Bucket = {
  count: number;
  resetAtMs: number;
};

export type InferenceRateLimiterConfig = {
  windowMs: number;
  maxRequestsPerIdentity: number;
  maxGlobalRequests: number;
};

export class InferenceRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private globalBucket: Bucket | null = null;

  constructor(private readonly config: InferenceRateLimiterConfig) {
    if (!Number.isSafeInteger(config.windowMs) || config.windowMs <= 0) throw new Error("Rate limit window must be a positive integer");
    if (!Number.isSafeInteger(config.maxRequestsPerIdentity) || config.maxRequestsPerIdentity <= 0) throw new Error("Identity rate limit must be a positive integer");
    if (!Number.isSafeInteger(config.maxGlobalRequests) || config.maxGlobalRequests <= 0) throw new Error("Global rate limit must be a positive integer");
  }

  consume(identity: string, nowMs = Date.now()): InferenceRateLimitResult {
    this.cleanup(nowMs);

    const global = this.getGlobalBucket(nowMs);
    if (global.count >= this.config.maxGlobalRequests) {
      return { allowed: false, retryAfterMs: Math.max(1, global.resetAtMs - nowMs), reason: "global_rate_limited" };
    }

    const bucket = this.getBucket(identity, nowMs);
    if (bucket.count >= this.config.maxRequestsPerIdentity) {
      return { allowed: false, retryAfterMs: Math.max(1, bucket.resetAtMs - nowMs), reason: "identity_rate_limited" };
    }

    bucket.count += 1;
    global.count += 1;
    return { allowed: true, retryAfterMs: 0, reason: "ok" };
  }

  getBucketCount(): number {
    return this.buckets.size + (this.globalBucket ? 1 : 0);
  }

  cleanup(nowMs = Date.now()): void {
    for (const [identity, bucket] of this.buckets) {
      if (bucket.resetAtMs <= nowMs) this.buckets.delete(identity);
    }
    if (this.globalBucket && this.globalBucket.resetAtMs <= nowMs) this.globalBucket = null;
  }

  private getBucket(identity: string, nowMs: number): Bucket {
    const existing = this.buckets.get(identity);
    if (existing) return existing;
    const created = { count: 0, resetAtMs: nowMs + this.config.windowMs };
    this.buckets.set(identity, created);
    return created;
  }

  private getGlobalBucket(nowMs: number): Bucket {
    if (this.globalBucket) return this.globalBucket;
    this.globalBucket = { count: 0, resetAtMs: nowMs + this.config.windowMs };
    return this.globalBucket;
  }
}
