# Dedicated Tool Selection Stage

## Observabilidad F.1.10

La instrumentación interna separa `selectorDurationMs`, `agentDurationMs` y
`totalDurationMs`, además de registrar decisión, herramienta seleccionada,
attempts, repair y validez. `toolResult` omite el selector. Los diagnostics raw
son opt-in mediante `TOOL_DIAGNOSTICS_CAPTURE_RAW_OUTPUT`, están limitados y no
se exponen por API.

F.1.11 puede solicitar structured output al provider mediante una capacidad
neutral; el selector sigue siendo interno y el contrato HTTP no cambia.

v1.2 usa una etapa interna opcional para separar la decisión de herramienta de la generación de respuesta.

## Flujo

`input + tool catalog → Tool Selector → NO_TOOL o USE_TOOL → Agent Orchestration`

El selector usa el mismo `LlmService`, una salida Zod estricta y como máximo un repair. Su salida interna es:

```json
{"decision":"NO_TOOL"}
```

o:

```json
{"decision":"USE_TOOL","tool":"consultar_disponibilidad","arguments":{"date":"tomorrow"}}
```

El selector no responde al usuario, no ejecuta herramientas y no recibe chunks RAG completos. Sólo conoce el input y metadata del catálogo. La temperatura es `0` por llamada y el presupuesto es `180` tokens; no cambia defaults globales.

La decisión se valida contra la allowlist y el `inputSchema`. Si decide `NO_TOOL`, orchestration debe producir `RESPOND`; si decide `USE_TOOL`, debe producir `CALL_TOOL` para exactamente la herramienta seleccionada. Con `toolResult`, el selector se omite y el follow-up exige `RESPOND`.

Sin tools no existe llamada al selector y v1/v1.1 permanecen sin cambios. No hay ejecución, loops, múltiples llamadas, credenciales ni cambios de contrato HTTP.
