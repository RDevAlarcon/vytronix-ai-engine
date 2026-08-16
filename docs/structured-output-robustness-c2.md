# Fase C.2 — Structured Output Robustness

## Diagnóstico de `lead-02`

El resultado histórico `benchmarks/results/benchmark-2026-08-16T19-40-34-420Z.json` solo conserva `AGENT_OUTPUT_INVALID`; no conserva el raw output ni los `ZodIssue`. Por eso no es posible atribuir responsablemente el fallo a un campo concreto, truncamiento, enum, tipo o JSON inválido. Sí queda establecido que el fallo ocurrió en la validación final del output del agente, no en un error de conexión o timeout. El warmup del mismo caso había terminado correctamente en el segundo intento, lo que es compatible con un fallo recuperable de structured output, pero no identifica su forma exacta.

## Cambio realizado

Se añadió `src/ai/structured-output/structured-output.ts`, una capa neutral usada por los cuatro agentes. El flujo es:

1. generación normal;
2. extracción y parseo JSON existentes;
3. validación Zod;
4. como máximo un repair retry si falla JSON o schema;
5. prompt de reparación con output anterior truncado, resumen compacto de issues y schema esperado;
6. error original sanitizado si el segundo intento falla.

La reparación conserva semántica y solicita únicamente JSON. No cambia prompts normales, schemas, guardrails ni el contrato API v1. `AgentRunResult` expone `repairAttempt` como metadata interna opcional; no se añadió migración.

## Límites y riesgos

- No se intenta adivinar JSON arbitrariamente roto.
- El raw output no se incluye en errores públicos.
- El resultado benchmark histórico no permite reconstruir el output de `lead-02`.
- El benchmark aislado posterior falló después del repair: 0/1, `AGENT_OUTPUT_INVALID`, 77.794 s. Por esa razón no se ejecutaron los 5 casos lead ni los 20 casos.
- `attemptCount` del registro de fallo sigue siendo 0 porque el benchmark no propaga detalles de ejecuciones que terminan en excepción; el flujo interno sí está limitado a una generación y un repair.

## Tests offline

Se cubren JSON válido, markdown fence, JSON inválido, schema inválido, enum/tipo/campo requerido, sanitización de Zod issues, repair exitoso, repair fallido y máximo de un repair. Los tests no llaman a un LLM real.

## Resultado C.2

La robustez general quedó implementada y validada offline, pero C.2 no se declara completada: `lead-02` todavía no fue recuperado en la validación real con LM Studio. No se ejecutó benchmark lead ni completo después del cambio.

TTFT continúa siendo `null`; no hay streaming.
