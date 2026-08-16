# Ollama provider

Ollama is supported through its OpenAI-compatible API:

```text
{OLLAMA_BASE_URL}/v1/chat/completions
```

This keeps the request and response boundary identical to LM Studio and
avoids provider-specific logic in agents.

Configuration:

```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=<model-name>
OLLAMA_TEMPERATURE=0.2
OLLAMA_MAX_TOKENS=1200
```

The model is intentionally a placeholder. This project does not download or
select a production model. Ollama must run separately for
`npm run test:llm:ollama`.

No Ollama container is added to Docker Compose in Phase B.
