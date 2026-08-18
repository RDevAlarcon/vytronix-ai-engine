# Vytronix AI Engine v1.2 — Freeze

## Scope

v1.2 adds internal structured Tool Calling while preserving the external
`POST /api/agents/run` contract. The Engine validates and returns a request for
a Tool; it never executes that Tool.

## External contract

- v1: legacy agent output remains supported.
- v1.1: optional `ragContext` remains supported.
- v1.2: optional `tools` and `toolResult` are supported.
- Actions are `RESPOND` and `CALL_TOOL`.
- At most one Tool Call is returned per run.
- No v1.3 contract is introduced.

## Internal routing

- `LEGACY`: no Tools; preserves v1/v1.1 generation.
- `NATIVE`: Tools without RAG when the provider supports native Tool Calling.
- `SELECTOR`: Tools with RAG, or provider fallback.
- `TOOL_RESULT_RESPOND`: an existing ToolResult always produces a response.

The selector path uses Tool Selector V2, ToolArgumentExtractor, grounding
validation, and deterministic Tool Call assembly. Provider Structured Outputs
and native Tool Calling are optional internal optimizations.

## Deterministic envelopes

When the action is known, code assembles the final envelope:

- `CALL_TOOL` is assembled only after allowlist, input-schema, grounding, and
  confirmation metadata validation.
- `RESPOND` is assembled after valid domain output generation.

The model does not control the final orchestration envelope in those paths.

## Argument and confirmation security

Arguments pass through generation/extraction, input-schema validation, grounding
validation, allowlist validation, and deterministic assembly. Required values are
never invented. Relative dates use the explicit mappings `today`, `tomorrow`,
and `day_after_tomorrow`; the Engine does not resolve them using system date.

Missing required information produces `RESPOND`, asking only for the missing
fields. `requiresConfirmation` comes exclusively from the Tool catalog. A WRITE
Tool Call is a request only and does not imply execution.

## RAG and untrusted data

RAG content, Tool descriptions, and ToolResult content are untrusted data. They
cannot change system rules, authorize Tools, alter schemas, execute code, or
reveal secrets.

## Provider paths

Ollama currently supports Structured Outputs and native Tool Calling internally.
LM Studio retains the selector/textual fallback path. Provider-native formats
never appear in the public API.

`granite4:3b` is the current validated local candidate, not a hardcoded product
requirement. The model remains configurable.

## Validation and diagnostics

Zod/domain validation, Tool validation, grounding, and deterministic assembly
remain defense-in-depth. `TOOL_DIAGNOSTICS_CAPTURE_RAW_OUTPUT` is off by default;
opt-in raw captures are limited and are not exposed through the public API.

Relevant errors include `LLM_EMPTY_CONTENT`, `TOOL_CALL_INVALID`,
`TOOL_ARGUMENTS_INVALID`, `TOOL_NOT_AVAILABLE`, and the Tool Selection errors
implemented by the Engine.

## Known limitations and performance

Local model variability remains possible. A transient READ response once returned
RESPOND, while immediate repetitions passed. Validation and deterministic
assembly prevent invalid final envelopes, but model reliability is not assumed.

Observed RAG+Tool latency improved from approximately 101.68 seconds in the
early selector/repair path to approximately 12.9 seconds in the grounded
deterministic path. Native READ/WRITE paths were substantially faster in local
tests. These are local observations, not production SLOs.

## Explicitly out of scope

v1.2 does not include Tool execution, VyAssistant integration, credentials,
MCP, external Tools, WhatsApp, payments, execution callbacks, multi-Tool loops,
parallel Tool Calls, or autonomous multi-round agents.

VyAssistant remains responsible in a future integration for authorization,
tenancy, business allowlists, execution, credentials, idempotency, confirmation,
audit, timeouts, and side effects.
