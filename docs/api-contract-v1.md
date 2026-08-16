# AI Engine API Contract v1

Base URL: deployment-specific. The engine exposes JSON APIs under `/api`.

## Authentication

Internal endpoints require `X-API-Key` when `API_KEY_REQUIRED=true` or when
`NODE_ENV=production`. The configured secret is `AI_ENGINE_API_KEY` (the
legacy `INTERNAL_API_KEY` is accepted only as a transition fallback). Never
send the key in a URL or log it.

## POST `/api/agents/run`

Request:

```json
{
  "agent": "lead",
  "input": {},
  "mode": "standard"
}
```

`agent` is one of `lead`, `landing`, `proposal`, `support`. `mode` is
`standard` or `fast`; omitted mode defaults to `standard`.

The input shape is agent-specific and validated with Zod. The complete JSON
request is limited to 128 KiB. Important field limits are documented in the
source schemas and include bounded strings and arrays.

Success (`200`):

```json
{
  "success": true,
  "data": {
    "runId": "uuid",
    "agent": "lead",
    "parsedOutput": {},
    "rawOutput": "string",
    "metadata": {
      "mode": "standard",
      "provider": "lmstudio",
      "model": "qwen2.5-7b-instruct",
      "durationMs": 800,
      "attemptCount": 1,
      "usage": {}
    }
  }
}
```

Error envelope:

```json
{
  "success": false,
  "error": {
    "code": "AGENT_INPUT_INVALID",
    "message": "Invalid agent input"
  }
}
```

Common statuses: `400` invalid request, `401` invalid/missing API key,
`413` payload too large, `429` rate limited, `502` invalid/upstream LLM
response, `503` provider unavailable, and `504` provider timeout.

The LLM timeout is configured by `LLM_REQUEST_TIMEOUT_MS` (45 seconds by
default). The endpoint may perform one retry for invalid JSON/schema output.

## Other endpoints

- `GET /api/health`: public minimal health response; it does not call the LLM.
- `GET /api/models/test`: protected operational check that performs a real
  LLM request and can consume model/provider resources.
- `POST /api/agents/classify`: protected scope classification without LLM.
- `POST /api/runs/:id/feedback`: protected operator feedback.
