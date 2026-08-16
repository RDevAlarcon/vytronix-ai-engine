# ADR: Rate limiting v1

Status: accepted for Phase A

Use a small in-memory `InMemoryRateLimiter` behind a replaceable service. It
is appropriate for local and single-instance operation only. A future
distributed deployment may replace the implementation without changing the
API guard contract; Redis is intentionally out of scope for Phase A.
