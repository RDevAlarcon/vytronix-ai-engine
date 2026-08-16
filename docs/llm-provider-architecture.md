# LLM provider architecture

The agent layer depends only on neutral `LlmChatRequest` and
`LlmChatResponse` types. `LlmService` delegates to one configured
`LlmProvider`:

```text
Agent → LlmService → LlmProvider
                    ├─ LM Studio
                    └─ Ollama
```

Both providers use the OpenAI-compatible `/v1/chat/completions` protocol.
The shared adapter owns timeout handling, response parsing, usage
normalization and normalized provider errors. Provider name and model remain
metadata for traceability.

There is no automatic fallback. A failed active provider returns an error.
Provider selection is controlled only by `LLM_PROVIDER`.

`LlmProvider` is for text generation only. It is not an embeddings
abstraction. A future `EmbeddingProvider` must remain separate so LLM and
embedding runtimes can be selected independently.

Future providers such as DeepSeek can add another adapter without changing
agents or the API contract. DeepSeek is not implemented in this phase.
