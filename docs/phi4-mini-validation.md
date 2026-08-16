# Validación `phi4-mini`

## Disponibilidad y API

Ollama respondió en `http://127.0.0.1:11434`. El modelo apareció como `phi4-mini:latest` en `/api/tags` y `/v1/models`; la referencia `phi4-mini` fue aceptada por la API.

La llamada directa OpenAI-compatible produjo `message.content` no vacío, sin campo `reasoning` ni `thinking`, `finish_reason=stop` y usage `15/11/26` (prompt/completion/total). La respuesta textual no fue una reproducción literal de `VYTRONIX OK`, pero el formato es compatible con el provider actual. El test `npm run test:llm:ollama` pasó en 3061 ms.

## `lead-02`

Configuración: temperature `0.2`, warmup `0`, repetitions `5`, raw diagnostics activados.

- Success final: 5/5
- Schema final: 5/5
- First-pass schema: 5/5
- Guardrails: 5/5
- Repair rate: 0/5
- Repair failures: 0
- `detected_service`: `unknown`
- `is_in_scope`: boolean `true` en todas las respuestas
- Finish reason: `stop`
- Latencia promedio: 21174 ms
- Mediana: 18830 ms
- P95: 32217 ms
- Tokens/s: aproximadamente 3.94–8.41

Resultado: `benchmarks/results/benchmark-2026-08-16T22-02-50-339Z.json`.

## Cinco casos Lead

Con warmup `1` y repetitions `1`:

- Success: 5/5
- Schema: 5/5
- Guardrails: 5/5
- Latencia promedio no-warmup: 11117 ms
- P95: 20386 ms

Resultado: `benchmarks/results/benchmark-2026-08-16T22-04-52-987Z.json`.

## Benchmark completo

Con warmup `1`, repetitions `1` y temperature `0.2`:

- Casos: 20
- Success: 20/20
- Schema final: 20/20
- Guardrails: 20/20
- First-pass: 20/20; los 8 casos fuera de alcance fueron resueltos por el guardrail interno sin LLM y los 12 casos con LLM pasaron en el primer intento
- Repairs: 0
- Latencia promedio: 15670.5 ms
- Mediana: 15807 ms
- P95: 42285 ms
- Output tokens promedio: 203.75
- Output tokens totales: 2445
- Retries: 0
- Errores: ninguno

Resultado: `benchmarks/results/benchmark-2026-08-16T22-06-51-196Z.json`.

## Comparación

Frente a `qwen2.5:3b-instruct`, que mostró aproximadamente 33,3% de first-pass en `lead-02`, `phi4-mini` mostró 100% en la muestra de cinco. No presentó el error recurrente `is_in_scope: "true"`.

Frente a Qwen3 4B, `phi4-mini` no dejó `content` vacío ni expuso un flujo de reasoning incompatible. No se midieron recursos de CPU/RAM/GPU en esta ejecución.

## Recomendación

`phi4-mini` es un candidato fuerte para continuar benchmark controlado. Los resultados son mejores que los de Qwen2.5 3B en este dataset y flujo, pero todavía no constituyen una elección definitiva de producción: falta repetir en hardware objetivo y observar estabilidad sostenida.
