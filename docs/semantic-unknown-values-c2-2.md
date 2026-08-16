# Fase C.2.2 — Semantic Unknown Values

## Decisión

Para `lead.detected_service` se mantiene el tipo `string` no vacío y se adopta el sentinel semántico explícito `"unknown"` cuando el servicio no puede determinarse.

Esto es compatible con el contrato API v1 existente, la columna PostgreSQL `detected_service` no nullable, la persistencia actual y los consumidores que ya esperan un string. No se cambia a `null` ni se relaja `.min(1)`.

## Cambios

- El prompt normal de Lead ahora indica que nunca debe usar strings vacíos en campos requeridos.
- Si no puede identificar el servicio, debe devolver `detected_service: "unknown"`.
- El prompt fast contiene la misma regla.
- El schema continúa rechazando `""`.
- Se agregaron regresiones para servicio identificado, servicio desconocido y string vacío.

No se añadió una normalización automática de strings vacíos: transformar cualquier vacío podría ocultar errores semánticos en otros campos. La reparación común ya muestra el path y la restricción Zod (`detected_service` / `too_small`) al modelo.

## Validación real

Con LM Studio y `qwen2.5-7b-instruct`:

- `lead-02`: 1/1 success, schema 100%, guardrail 100%, primer intento, `detected_service: "unknown"`, 49.393 s.
- Los 5 casos `lead`: 5/5 success, schema 100%, guardrail 100%; promedio 19.335 s y p95 36.403 s en los casos no-warmup.
- Benchmark completo: no se completó. La ejecución fue detenida por el límite operativo de 15 minutos durante el warmup de `proposal-05`, que terminó en `LLM_TIMEOUT`. No se generó un resultado completo y no se declara 20/20.

Resultado de `lead-02`: `benchmarks/results/benchmark-2026-08-16T20-32-26-840Z.json`.

La instrumentación diagnóstica permaneció activa solo para estas ejecuciones locales; `BENCHMARK_CAPTURE_RAW_OUTPUT` debe eliminarse o establecerse en `false` fuera de diagnóstico.
