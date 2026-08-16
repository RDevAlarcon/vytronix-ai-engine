# ADR: Multi-provider LLM architecture

Status: accepted for Phase B

## Decision

Use a neutral `LlmProvider` interface and select exactly one provider from
validated `LLM_PROVIDER`. LM Studio and Ollama use the shared
OpenAI-compatible chat adapter.

## Rationale

LM Studio already uses this protocol and Ollama exposes a compatible endpoint.
The shared boundary avoids duplicate parsing, timeout and error logic while
keeping agents provider-agnostic.

There is no fallback, automatic routing or load balancing. Provider failures
remain visible and deterministic.

## Future evolution

DeepSeek or another provider can be added as a separate adapter. Embeddings
must use a future `EmbeddingProvider`, not `LlmProvider`; RAG and embeddings
are outside Phase B. Provider-specific function calling and structured output
are also outside this phase.
