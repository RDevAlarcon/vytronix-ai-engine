# Fase C.3 — Runtime & Resource Benchmark

## Hardware y limitaciones

- Logical processors detectados: 18
- Ollama API: disponible
- GPU/VRAM: no medible; `nvidia-smi` no está disponible
- RAM total/disponible: no medible desde esta sesión; WMI y Performance Counters fueron rechazados/no disponibles
- Ollama CLI: no está en PATH
- Procesos Ollama: runtime y app activos

No se inventan métricas de CPU, RAM, GPU o temperatura.

## Ollama residency

`GET /api/ps` mostró `phi4-mini:latest` residente en CPU:

- `size_vram`: `0`
- `context_length`: `4096`
- `expires_at`: informado por Ollama

No se ejecutó descarga forzada ni se modificó keep-alive. La API muestra que el modelo permanece cargado tras las pruebas.

## Warm single request

Configuración: `lead-02`, warmup `1`, repetitions `3`, concurrency `1`, temperature `0.2`.

- Success: 3/3
- Schema: 3/3
- Guardrails: 3/3
- Repairs: 0
- Promedio: 18645 ms
- Mediana: 18090 ms
- P95: 19857 ms
- Output tokens promedio: 151.67
- Errores: 0

Resultado: `benchmarks/results/benchmark-2026-08-16T22-39-01-277Z.json`.

## Benchmark completo single-concurrency

- Casos: 20
- Success: 20/20
- Schema: 20/20
- Guardrails: 20/20
- Repairs/retries: 0
- Errores: 0
- Runtime total aproximado: 866.9 s
- Latencia promedio: 20593.7 ms
- Mediana: 21613 ms
- P95: 54164 ms
- Output tokens promedio: 200.83
- Output tokens totales: 2410

Resultado: `benchmarks/results/benchmark-2026-08-16T22-40-44-504Z.json`.

## Estabilidad prolongada

Se ejecutaron 10 inferencias consecutivas de `lead-02`, sin warmup adicional:

- Success: 10/10
- Schema: 10/10
- Guardrails: 10/10
- Repairs: 0
- Errores: 0
- Promedio: 24197.1 ms
- Mediana: 23599 ms
- P95: 26192 ms
- Output tokens promedio: 151.2

No hay evidencia de memory leak funcional, degradación progresiva ni errores crecientes. Las métricas de memoria no pudieron medirse externamente.

Resultado: `benchmarks/results/benchmark-2026-08-16T22-55-19-840Z.json`.

## Concurrency 2

No ejecutada. El harness actual no expone una opción limpia de concurrencia y no se modificó código para introducirla. No se realizó stress testing.

## Comparación

Frente a `qwen2.5:3b-instruct`, `phi4-mini` mostró estabilidad estructural superior: 20/20 sin repairs frente a la variabilidad de tipos observada en Qwen2.5 3B. El modelo phi4-mini ocupa aproximadamente 2.49 GB en disco según `/api/tags`; `/api/ps` mostró aproximadamente 3.09 GB de tamaño residente reportado y uso de VRAM cero.

Frente al baseline LM Studio + `qwen2.5-7b-instruct`, la comparación no aísla runtime: cambian modelo, provider y hardware de ejecución. Phi4-mini presenta latencia local razonable y menor footprint de modelo, pero no se debe declarar ganador definitivo.

## Recomendación

Clasificación: **A — candidato fuerte para benchmark del servidor**.

Antes de congelar una decisión de producción, repetir la medición en el Envy después de la ventana de estabilidad de 30 días, observando RAM, swap, CPU, temperatura y concurrencia real. El engine puede congelarse como v1 sin cambios derivados de esta fase.
