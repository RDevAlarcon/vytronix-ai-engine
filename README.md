# vytronix-ai-engine

La v1.2 añade structured tool calling opcional: el Engine decide y valida una solicitud, pero nunca ejecuta herramientas. Consulta [tool-calling-contract-v1-2.md](docs/tool-calling-contract-v1-2.md) y [tool-calling-security.md](docs/tool-calling-security.md).

> Vytronix AI Engine v1 — frozen baseline. Current benchmark candidate: Ollama + `phi4-mini`. Provider and model remain configurable.

Motor interno de agentes IA de Vytronix, separado del sitio principal (`vytronix.cl`), diseñado para correr local-first con LM Studio y preparado para despliegue futuro en Railway/Vercel.

## Por qué es un proyecto separado

- Mantiene aislada la lógica de agentes, prompts y trazabilidad operativa.
- Evita acoplar procesos internos de automatización al sitio corporativo público.
- Permite evolucionar este motor como backend/API reutilizable para otros productos de Vytronix.

## Stack

- Next.js App Router + TypeScript estricto
- Tailwind CSS
- Zod (validación entrada/salida)
- PostgreSQL + Drizzle ORM
- Fetch nativo hacia API OpenAI-compatible de LM Studio
- Runtime Node.js

## Arquitectura

```text
src/
  ai/
    agents/
      agent.examples.ts
      agent.router.ts
      agent.schemas.ts
      agent.types.ts
      lead.agent.ts
      landing.agent.ts
      proposal.agent.ts
      support.agent.ts
    llm/
      llm.service.ts
      llm.types.ts
    prompts/
      lead.prompt.ts
      landing.prompt.ts
      proposal.prompt.ts
      support.prompt.ts
  db/
    client.ts
    schema/index.ts
    repositories/agent-runs.repository.ts
    seeds/seed.ts
  app/
    api/
      agents/run/route.ts
      health/route.ts
      models/test/route.ts
    agents/page.tsx
    dashboard/page.tsx
    runs/page.tsx
    runs/[id]/page.tsx
```

## Agentes incluidos

1. `lead`: califica leads y sugiere siguiente acción.
2. `landing`: genera brief estructurado de landing.
3. `proposal`: crea borrador de propuesta comercial.
4. `support`: clasifica tickets y evalúa escalamiento humano.

Todos los agentes:
- validan input con Zod,
- fuerzan salida JSON estructurada,
- validan output con Zod,
- retornan metadata (modelo, provider, latencia, usage).

## Variables de entorno

Usa `.env.example` como base:

```env
NODE_ENV=development
DATABASE_URL=postgres://postgres:change-me@127.0.0.1:5433/vytronix_ai_engine

LLM_PROVIDER=lmstudio
LM_STUDIO_BASE_URL=http://127.0.0.1:1234
LM_STUDIO_MODEL=qwen2.5-7b-instruct
LM_STUDIO_TEMPERATURE=0.2
LM_STUDIO_MAX_TOKENS=900
LLM_REQUEST_TIMEOUT_MS=90000
API_KEY_REQUIRED=false
AI_ENGINE_API_KEY=replace-with-a-long-random-key
RATE_LIMIT_ENABLED=true
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=60
```

### Seguridad API (local-first y producción)

- En local: deja `API_KEY_REQUIRED=false` para probar UI y endpoints sin fricción.
- En producción (Railway): usa `API_KEY_REQUIRED=true` y define `INTERNAL_API_KEY` robusta.
- Rate limit configurable con:
  - `RATE_LIMIT_ENABLED`
  - `RATE_LIMIT_WINDOW_MS`
  - `RATE_LIMIT_MAX_REQUESTS`

## Instalación local (Windows compatible)

1. Instala dependencias:
```bash
npm install
```
2. Crea `.env` a partir de `.env.example`.
3. Levanta PostgreSQL local y crea la base `vytronix_ai_engine`.
4. Ejecuta migraciones:
```bash
npm run db:migrate
```
5. (Opcional) Inserta datos de prueba:
```bash
npm run db:seed
npm run test:guardrails
```

## Suite anti-desvio (scope + jailbreak)

Puedes ejecutar una bateria de pruebas para validar que cada agente:
- responde en su dominio cuando corresponde,
- rechaza fuera de alcance,
- no obedece intentos de jailbreak.

Comando base:

```bash
npm run test:guardrails
```

Opciones:

```bash
# correr solo un agente
npx tsx src/testing/guardrail-suite.ts --agent support

# correr en modo fast
npx tsx src/testing/guardrail-suite.ts --mode fast

# aumentar timeout por caso (modelos locales lentos)
npx tsx src/testing/guardrail-suite.ts --timeout-ms 120000

# cambiar host API (si no usas localhost:3001)
APP_BASE_URL=http://127.0.0.1:3001 npx tsx src/testing/guardrail-suite.ts
```

Casos definidos en:
- `src/testing/guardrail-cases.ts`
6. Levanta la app:
```bash
npm run dev
```

## Levantar con Docker Compose

Este proyecto incluye `docker-compose.yml` para correr:
- `db` (PostgreSQL 16)
- `app` (Next.js en modo production)

Comandos:

```bash
docker compose up -d --build
docker compose logs -f app
```

Notas:
- La app queda en `http://localhost:3001`.
- La DB queda en `localhost:5432`.
- El contenedor `app` ejecuta migraciones al iniciar (`npm run db:migrate`).
- Dentro de Docker, el LLM apunta a `http://host.docker.internal:1234` para conectarse al LM Studio que corre en tu host Windows.

Para detener:

```bash
docker compose down
```

Para detener y borrar volumen de la DB:

```bash
docker compose down -v
```

## Docker de desarrollo (hot-reload)

Tambien tienes `docker-compose.dev.yml` para trabajar con recarga en caliente.

Comandos:

```bash
docker compose -f docker-compose.dev.yml up -d --build
docker compose -f docker-compose.dev.yml logs -f app
```

Notas:
- Monta el codigo fuente local en `/app`.
- Expone la app en `http://localhost:3001`.
- Ejecuta `db:migrate` al inicio del contenedor.
- Usa `WATCHPACK_POLLING=true` para mejorar el watch en Windows.

Para detener:

```bash
docker compose -f docker-compose.dev.yml down
```

Para detener y borrar volumen:

```bash
docker compose -f docker-compose.dev.yml down -v
```

## Conectar LM Studio

1. Abre LM Studio.
2. Carga un modelo local (ejemplo: `qwen2.5-7b-instruct`).
3. Inicia Local Server en `http://127.0.0.1:1234`.
4. Verifica conectividad:
```bash
curl http://localhost:3001/api/models/test
```

Si LM Studio no está activo, el sistema devuelve error claro (`LLM_CONNECTION_ERROR` o `LLM_TIMEOUT`) sin romper la UI.

## API interna

### `POST /api/agents/run`

Body:

```json
{
  "agent": "lead",
  "mode": "fast",
  "input": {
    "leadMessage": "Hola, necesitamos automatizar respuestas de leads.",
    "knownServices": ["Landing pages", "CRM automation"]
  }
}
```

Header opcional/requerido (según `API_KEY_REQUIRED`):

```http
X-API-Key: <AI_ENGINE_API_KEY>
```

`mode` soportado:
- `fast`: menos tokens, respuesta mas rapida. En la configuracion actual se recomienda para `lead`.
- `standard`: salida mas amplia y mayor estabilidad (default).

Respuesta:

```json
{
  "success": true,
  "data": {
    "runId": "uuid",
    "agent": "lead",
    "parsedOutput": {},
    "rawOutput": "string",
    "metadata": {
      "model": "qwen2.5-7b-instruct",
      "provider": "lmstudio",
      "durationMs": 800
    }
  }
}
```

### `GET /api/health`

Estado general + chequeo DB + configuración LLM.

### `GET /api/models/test`

Prueba directa de conexión con LM Studio.

## Persistencia y trazabilidad

Tablas iniciales:
- `users`
- `agent_runs`
- `lead_records`
- `landing_briefs`
- `proposal_drafts`
- `support_cases`

Cada ejecución guarda:
- agente,
- input,
- raw output,
- parsed output,
- modelo/proveedor,
- timestamps,
- estado/error.

## UI interna mínima

- `/` Home
- `/dashboard` estado general
- `/agents` ejecución de agentes con ejemplos JSON
- `/runs` historial reciente
- `/runs/[id]` detalle de ejecución

## Ejemplos de input por agente

Los ejemplos están centralizados en:
- `src/ai/agents/agent.examples.ts`

Se usan directamente en la pantalla `/agents` con botón "Cargar ejemplo".

## Scripts útiles

```bash
npm run dev
npm run build
npm run lint
npm run typecheck
npm run db:generate
npm run db:migrate
npm run db:push
npm run db:seed
```

## Integración futura con Vytronix principal

- Consumir este engine desde `vytronix.cl` vía HTTP interno (`/api/agents/run`).
- Añadir auth interna (API keys/JWT service-to-service).
- Separar en despliegues: frontend corporativo vs motor de agentes.
- Compartir eventos vía cola o webhook para flujos comerciales.

## Roadmap

1. Añadir autenticación y RBAC interno.
2. Agregar observabilidad (logs estructurados + métricas).
3. Soporte multi-provider (OpenAI/Anthropic/Azure) con misma interfaz `llm.service`.
4. Workflows multi-agente y memoria de contexto por cliente.
5. Panel admin con filtros, reintentos y versionado de prompts.

## Task runner con justfile (opcional, recomendado)

Este repo incluye un `justfile` para usar comandos cortos y estandarizados.

Instalacion rapida en Windows:

```bash
winget install Casey.Just
```

Comandos:

```bash
just                  # lista tareas
just dev-up           # docker dev up
just dev-logs         # logs app dev
just dev-down         # detener dev
just up               # docker prod-like up
just logs             # logs app prod-like
just down             # detener prod-like
just db-migrate       # correr migraciones
just db-seed          # seed data
```

## CI (GitHub Actions)

El repositorio incluye pipeline en:
- `.github/workflows/ci.yml`

Se ejecuta en `push` y `pull_request` y valida:
- `npm run typecheck`
- `npm run lint`
- `npm run test:guardrails:policy`

Nota:
- La suite `test:guardrails` (integracion HTTP + LLM real) se mantiene para entorno local.
- En CI se usa `test:guardrails:policy` porque no depende de LM Studio.

### `POST /api/agents/classify`

Audita si un input cae dentro del alcance del agente sin ejecutar el LLM.

Body:

```json
{
  "agent": "support",
  "input": {
    "ticketMessage": "No podemos entrar al dashboard desde ayer"
  }
}
```

Respuesta:

```json
{
  "success": true,
  "data": {
    "agent": "support",
    "inScope": true,
    "confidence": 0.75,
    "reason": "positive_hits=3, negative_hits=0, raw_score=3.00"
  }
}
```

Si ejecutas la suite de guardrails con API key activa:

```bash
ENGINE_API_KEY=<INTERNAL_API_KEY> npm run test:guardrails -- --timeout-ms 120000
```

## Learning Loop Basico

El engine ahora guarda senales de aprendizaje por cada `agent_run`:

- `quality_score`: score automatico 0-100 segun estructura, latencia, reintentos y consistencia minima.
- `quality_flags`: banderas como `needs_review`, `high_latency`, `missing_required_output`.
- `improvement_signals`: pistas operativas para ajustar prompts o reglas.
- `feedback_value`: `helpful` o `unhelpful` desde la UI interna.
- `feedback_comment`: nota corta opcional del operador.

### Migracion nueva

Antes de usar feedback/scoring en DB, corre:

```bash
npm run db:migrate
```

### Feedback interno

- En `Runs` puedes ver score y feedback por ejecucion.
- En `Run Detail` puedes marcar un resultado como util o no util.
- En `Dashboard` se muestra promedio de calidad y cola de runs que requieren revision.

## Proveedores LLM

El proveedor activo se selecciona con `LLM_PROVIDER=lmstudio` u
`LLM_PROVIDER=ollama`. LM Studio mantiene sus variables existentes. Ollama
usa su endpoint OpenAI-compatible y requiere `OLLAMA_BASE_URL` y
`OLLAMA_MODEL`; no se descargan modelos ni se incluye Ollama en Docker Compose.

La arquitectura está documentada en [`docs/llm-provider-architecture.md`](docs/llm-provider-architecture.md), [`docs/ollama-provider.md`](docs/ollama-provider.md) y [`docs/adr-multi-provider-llm.md`](docs/adr-multi-provider-llm.md).

Las pruebas reales son opt-in y no forman parte de los checks normales:

```bash
npm run test:llm:lmstudio
npm run test:llm:ollama
```

La arquitectura no fija `phi4-mini`: selecciona `LLM_PROVIDER=lmstudio` u
`LLM_PROVIDER=ollama` y el modelo correspondiente mediante variables de entorno.
El freeze v1 y sus límites están documentados en
[`docs/ai-engine-v1-freeze.md`](docs/ai-engine-v1-freeze.md). El benchmark local
de runtime de phi4-mini está resumido en
[`docs/phi4-mini-runtime-benchmark-c3.md`](docs/phi4-mini-runtime-benchmark-c3.md).

## RAG context v1.1

El endpoint `/api/agents/run` acepta opcionalmente `ragContext` con contexto ya
recuperado. El Engine no implementa retrieval, embeddings, vector DB ni
Knowledge Base; VyAssistant conserva esas responsabilidades. El contrato y
las reglas de seguridad están en [`docs/rag-context-contract-v1-1.md`](docs/rag-context-contract-v1-1.md)
y [`docs/rag-security.md`](docs/rag-security.md).

## Fase A: hardening y contrato v1

El contrato para consumidores está documentado en [`docs/api-contract-v1.md`](docs/api-contract-v1.md).
La línea base de seguridad está en [`docs/security-baseline.md`](docs/security-baseline.md) y la política de datos en [`docs/data-retention-and-privacy.md`](docs/data-retention-and-privacy.md).

Fuera de desarrollo, el engine requiere `AI_ENGINE_API_KEY`; las claves se comparan de forma constant-time y no se usan directamente como identificadores de rate limit. El endpoint `/api/models/test` es interno, protegido y genera una llamada real al proveedor.

Las migraciones son explícitas: ejecutar `npm run db:migrate` como paso aprobado antes de `npm run start`. El arranque de la aplicación no modifica automáticamente el esquema.
