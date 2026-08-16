# Fase C.1 — Validación local real de providers

Fecha: 2026-08-16

## Resumen

La validación no pudo ejecutar inferencias reales porque ningún provider local
estaba activo ni tenía un modelo cargado.

No se instalaron runtimes, no se descargaron modelos, no se modificó el
servidor Vytronix y no se ejecutó nada en el Envy.

## Providers encontrados

### LM Studio

- Instalado en el PC.
- CLI encontrada: `lms.exe` versión `1.3.3.0`.
- API `http://127.0.0.1:1234`: no disponible durante la inspección inicial.
- No había listener en el puerto `1234`.
- No había modelos cargados.

Modelos locales listados por la CLI:

- `qwen2.5-7b-instruct` — 7B, Qwen2, 4.68 GB.
- `qwen2.5-coder-7b-instruct` — 7B, Qwen2, 4.68 GB.

También existe un modelo de embeddings local (`text-embedding-nomic-embed-text-v1.5`),
pero no se utilizó ni se implementó soporte de embeddings.

Durante la inspección, `lms ps` despertó el servicio gráfico de LM Studio para
consultar el estado. No cargó modelos; los procesos iniciados durante esa
consulta fueron detenidos inmediatamente para restaurar el estado inicial.

### Ollama

- Ejecutable `ollama`: no encontrado.
- API `http://127.0.0.1:11434`: no disponible.
- No había listener en el puerto `11434`.
- Modelos disponibles: no determinable porque Ollama no está instalado.

## Integraciones ejecutadas

No se ejecutaron:

- `npm run test:llm:lmstudio`;
- `npm run test:llm:ollama`;
- `npm run test:http:agents`;
- benchmark real.

La razón es que ningún provider estaba disponible. Ejecutarlos habría producido
fallos de conexión, no una validación útil del engine.

## HTTP smoke

No ejecutado. No había un provider funcional para levantar el engine y probar
una ejecución real de agente.

La persistencia tampoco fue probada en esta fase porque no se levantó una base
de datos ni se ejecutaron migraciones.

## Benchmark real

No ejecutado.

No se generaron JSON de benchmark en `benchmarks/results/`.

La infraestructura continúa preparada para:

- warmup `1`;
- repetitions `1`;
- concurrency `1`;
- dataset parcial o completo;
- LM Studio u Ollama seleccionados por configuración.

## Métricas

No existen métricas reales de provider/modelo en esta validación.

El harness mantiene soporte para:

- success rate;
- schema validity;
- guardrail pass rate;
- average, median y P95 de latencia;
- output tokens;
- tokens/second cuando existe usage;
- retries;
- errores por código.

TTFT permanece en `null` porque la implementación no utiliza streaming.

## Recursos del PC

No se midieron recursos durante benchmark porque no hubo benchmark real.

No se instalaron herramientas adicionales ni se intentó atribuir CPU, RAM o
GPU a un provider inactivo.

## Comparación

No es posible comparar LM Studio contra Ollama en esta ejecución.

Además, los modelos instalados en LM Studio son distintos y Ollama no tiene
modelos disponibles, por lo que todavía no existe una comparación justa entre
runtimes/modelos.

## Regresión offline

Las validaciones sin provider real se ejecutaron correctamente:

- `npm run lint` — PASS.
- `npm run typecheck` — PASS.
- `npm run test:unit` — PASS.
- `npm run test:guardrails:policy` — PASS, 12/12.
- `npm run build` — PASS.
- `npm audit --omit=dev` — 0 critical, 0 high, 0 moderate, 0 low.
- Docker Compose producción — configuración válida.
- Docker Compose desarrollo — configuración válida.

## Próximo paso operativo

Para una validación C.1 real se requiere, manualmente:

1. iniciar LM Studio o instalar/iniciar Ollama fuera de este flujo;
2. cargar manualmente un modelo;
3. confirmar que el endpoint local responde;
4. ejecutar los integration tests opt-in;
5. ejecutar primero un benchmark pequeño;
6. ejecutar el dataset completo solo si el smoke inicial pasa.

No se elige modelo definitivo para VyAssistant en esta fase.

## Validación real ejecutada — 2026-08-16

### Integration test LM Studio

Comando:

```bash
npm run test:llm:lmstudio
```

Resultado: PASS.

```text
provider: lmstudio
model: qwen2.5-7b-instruct
durationMs: 9627
promptTokens: 27
completionTokens: 7
totalTokens: 34
```

### Benchmark pequeño

Configuración:

- provider: `lmstudio`;
- model: `qwen2.5-7b-instruct`;
- agents: `lead,support`;
- cases: 10;
- warmup: 1;
- repetitions: 1;
- concurrency: 1 serial.

Resultado:

| Métrica | Resultado |
|---|---:|
| Success rate | 100% |
| Schema valid | 100% |
| Guardrail pass | 100% |
| Average latency | 21241.6 ms |
| P95 latency | 68764 ms |

Archivo: `benchmarks/results/benchmark-2026-08-16T19-33-18-067Z.json`

### Benchmark completo

Configuración:

- provider: `lmstudio`;
- model: `qwen2.5-7b-instruct`;
- cases: 20;
- warmup: 1;
- repetitions: 1;
- concurrency: 1 serial.

Resultado:

| Métrica | Resultado |
|---|---:|
| Success rate | 95% |
| Schema valid | 95% |
| Guardrail pass | 100% |
| Average latency | 27019.35 ms |
| Median latency | 29056 ms |
| P95 latency | 62125 ms |
| Average output tokens | 204.18 |
| Total output tokens | 2246 |
| Retries | 0 |
| Errors | 1 `AGENT_OUTPUT_INVALID` |

El caso fallido fue `lead-02` con `AGENT_OUTPUT_INVALID` y duración de
`59783 ms`. Los ocho casos fuera de alcance fueron resueltos por el guardrail
interno y no realizaron inferencia LLM; sus resultados `internal`/
`policy-guardrail` no deben interpretarse como ejecuciones de LM Studio.

Tokens/second se registró por caso cuando hubo completion tokens y duración
válida. No se agregó una métrica agregada inventada.

Archivo: `benchmarks/results/benchmark-2026-08-16T19-40-34-420Z.json`

### Recursos e interpretación

No se obtuvo una medición fiable de RAM mediante `Get-CimInstance` por acceso
denegado. No se instalaron herramientas adicionales ni se registró CPU/GPU
como métricas del provider.

La integración LM Studio funciona y completó correctamente el 95% del dataset
bajo esta configuración. El único fallo fue de output estructurado, no de
conectividad ni timeout. Ollama sigue sin estar disponible, por lo que no hay
comparación entre providers ni base para declarar un modelo definitivo.
