export type RateLimitEntry = { count: number; windowStart: number };

export class InMemoryRateLimiter {
  private readonly entries = new Map<string, RateLimitEntry>();

  constructor(private readonly windowMs: number, private readonly maxRequests: number) {}

  consume(key: string, now = Date.now()): boolean {
    const current = this.entries.get(key);
    if (!current || now - current.windowStart >= this.windowMs) {
      this.entries.set(key, { count: 1, windowStart: now });
      return true;
    }

    if (current.count >= this.maxRequests) {
      return false;
    }

    current.count += 1;
    return true;
  }

  clear(): void {
    this.entries.clear();
  }
}
