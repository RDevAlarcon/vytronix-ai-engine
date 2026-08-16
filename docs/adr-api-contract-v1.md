# ADR: API contract v1

Status: accepted for Phase A

Keep `POST /api/agents/run`, the four existing agent names, `standard` and
`fast` modes, and the success/error envelopes documented in
`docs/api-contract-v1.md`. Additive metadata is allowed; removing or changing
the request contract requires a new version or an explicit compatibility
decision.
