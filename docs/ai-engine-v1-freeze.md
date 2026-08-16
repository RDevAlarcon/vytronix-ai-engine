# Vytronix AI Engine v1 — Freeze

Fecha del freeze: 2026-08-16

## Alcance

Versión estable del motor interno de IA de Vytronix con cuatro agentes: `lead`, `landing`, `proposal` y `support`. El contrato HTTP v1 conserva `POST /api/agents/run`, `GET /api/health`, `GET /api/models/test` y `POST /api/runs/:id/feedback`.

## Arquitectura

Los agentes delegan en `LlmService`, que resuelve un `LlmProvider` configurable. La implementación común OpenAI-compatible soporta LM Studio y Ollama mediante `LLM_PROVIDER`, URL y modelo configurables. Ningún agente depende de `phi4-mini`.

El output sigue el pipeline:

```text
LLM output → JSON extraction → parse → Zod validation → máximo un repair → validated output
```

Lead usa `detected_service="unknown"` cuando el servicio no puede determinarse; el schema continúa rechazando strings vacíos.

## Seguridad y operación

- Producción requiere `AI_ENGINE_API_KEY` y falla rápido si falta.
- Comparación de API key constant-time.
- Rate limiting in-memory, single-instance.
- Límites de payload y validación Zod.
- Errores públicos sanitizados.
- Health público mínimo y `/api/models/test` protegido.
- Docker runtime non-root.
- Secretos fuera de Compose y `.env` fuera de Git.
- Migraciones explícitas, separadas del arranque de aplicación.
- Diagnóstico raw desactivado por defecto; `BENCHMARK_CAPTURE_RAW_OUTPUT` es opt-in local.

La persistencia de `agent_runs` puede conservar inputs y outputs completos; las políticas de retención, PII y borrado siguen siendo deuda futura documentada.

## Providers y modelo candidato

LM Studio y Ollama permanecen soportados. `phi4-mini` es el candidato preferido de benchmark actual, no un modelo de producción permanente ni una dependencia arquitectónica. El modelo continúa siendo configurable.

La validación local de phi4-mini alcanzó 20/20 casos, sin repairs ni errores, y 10/10 inferencias consecutivas estables. Falta validar en el hardware objetivo.

## Fuera de v1

No forman parte de este freeze: RAG, embeddings, vector DB, multi-tenancy, conversaciones, memoria, tools, MCP, routing/fallback automático, streaming, TTFT, rate limiting distribuido/Redis, RBAC granular, DeepSeek, soporte específico de reasoning de Qwen3 y benchmark de producción en servidor.

## Pendiente de servidor

El benchmark del Envy se realizará después de una ventana de estabilidad de 30 días, sin conexión ni cambios durante este freeze. El objetivo aproximado es Ubuntu Server con 4 CPU, ~7 GiB RAM, Docker, VyBarber Web/API, PostgreSQL, Nginx Proxy Manager, Uptime Kuma, Netdata y cloudflared.

## Herramientas

Los benchmarks, tests LLM y HTTP smoke son opt-in. Los resultados raw permanecen ignorados en `benchmarks/results/`. La configuración de ejemplo está en `.env.example` y la documentación especializada enlazada desde README.
