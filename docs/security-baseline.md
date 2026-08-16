# Security baseline

- Production always requires `AI_ENGINE_API_KEY`; startup fails if absent.
- API keys are compared with constant-time comparison and are never used
  directly as rate-limit identifiers. The rate limiter uses a SHA-256
  fingerprint.
- Public errors expose only a stable code and safe message. Provider payloads,
  stack traces and internal details remain server-side.
- `/api/models/test` uses the same API guard as other internal endpoints.
- Rate limiting is in-memory and single-instance in v1. It is replaceable but
  is not suitable as a distributed security boundary.
- Payloads are limited to 128 KiB and agent schemas bound strings and arrays.
- Prompt safety is defense-in-depth only: system/user message separation,
  scope heuristics, anti-jailbreak instructions and output schemas. It does
  not fully prevent prompt injection.
- Docker credentials are supplied through environment variables. Use a secret
  manager outside local development.
