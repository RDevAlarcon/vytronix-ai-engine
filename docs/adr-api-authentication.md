# ADR: API authentication baseline

Status: accepted for Phase A

Production and any non-development environment require `AI_ENGINE_API_KEY`.
Local development may explicitly run without it. The guard uses
constant-time comparison and returns a stable `401 UNAUTHORIZED` response.
JWT, RBAC and user authentication remain outside this phase.
