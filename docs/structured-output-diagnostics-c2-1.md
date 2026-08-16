# Fase C.2.1 — Structured Output Diagnostics

## Modo de diagnóstico

El benchmark local puede activar la captura limitada mediante:

```powershell
$env:BENCHMARK_CAPTURE_RAW_OUTPUT="true"
npm run benchmark:lmstudio -- --cases lead-02 --warmup 0 --repetitions 1
```

El valor por defecto es `false`. En modo normal no se persiste raw output diagnóstico adicional. La captura no se activa automáticamente en producción, no incluye headers ni configuración de providers y está destinada únicamente a benchmarks locales con datos sintéticos. El límite actual es 4000 caracteres por output y se marca `rawOutputTruncated` cuando corresponde.

Los diagnósticos incluyen etapa (`INITIAL_OUTPUT`, `INITIAL_PARSE`, `INITIAL_SCHEMA`, `REPAIR_OUTPUT`, `REPAIR_PARSE`, `REPAIR_SCHEMA`), intento, provider, modelo, `finishReason`, longitud, estado de extracción, parseo JSON y issues Zod sanitizados. No se exponen en la respuesta pública API; los detalles internos siguen siendo eliminados por `toPublicError`.

## Resultado real de `lead-02`

- Provider: LM Studio
- Modelo: `qwen2.5-7b-instruct`
- Resultado: `0/1`, `AGENT_OUTPUT_INVALID`
- Duración: `76265 ms` (≈76,3 segundos)
- Initial: JSON válido, 517 caracteres, `finish_reason=stop`
- Initial schema: `detected_service` fue `""`; Zod reportó `too_small`, mínimo de un carácter
- Repair: JSON válido, 517 caracteres, `finish_reason=stop`
- Repair schema: repitió `detected_service=""` y el mismo issue Zod
- Truncamiento: no observado; terminó con `stop`, no `length`
- Categoría: B — JSON válido pero schema inválido; concretamente D — tipo correcto pero valor vacío no permitido

El raw output fue capturado solo en el resultado local:

`benchmarks/results/benchmark-2026-08-16T20-25-49-867Z.json`

## Causa raíz

El modelo entendió la intención del caso, pero produjo un valor vacío para un campo requerido con restricción `.min(1)`. El repair prompt recibió la respuesta anterior y el issue, pero el modelo reprodujo el mismo objeto sin corregir el valor. La evidencia no apunta a truncamiento, extracción JSON, provider o timeout. La hipótesis técnica principal para C.2.2 es mejorar la instrucción/representación de reparación para valores requeridos vacíos, sin relajar el schema ni introducir una corrección específica para `lead-02`.

## Desactivación

```powershell
Remove-Item Env:BENCHMARK_CAPTURE_RAW_OUTPUT
```

No se modificó el contrato API v1 ni se añadieron columnas productivas.
