# Tool Calling Contract v1.2

v1.2 extiende `POST /api/agents/run` sin cambiar la URL ni los requests v1/v1.1. `tools` y `toolResult` son opcionales.

Cuando `tools` está presente, una etapa interna de selección decide `NO_TOOL` o una única `USE_TOOL`; esta etapa no se expone ni ejecuta herramientas. `toolResult` omite esa etapa.

## ToolDefinition

```json
{
  "name": "consultar_disponibilidad",
  "description": "Consulta horarios.",
  "inputSchema": {"type":"object","properties":{"date":{"type":"string"}},"required":["date"],"additionalProperties":false},
  "sideEffect": "READ_ONLY",
  "requiresConfirmation": false
}
```

Los nombres usan `[a-z0-9_]+`, hay un máximo de 20 herramientas, descripción de 2.000 caracteres, schema de 12.000 caracteres y contexto total de 40.000 caracteres. No se aceptan `$ref` ni referencias remotas.

## ToolResult

```json
{"toolCallId":"call_opaque","toolName":"consultar_disponibilidad","status":"SUCCEEDED","output":{"slots":[]}}
```

`status` puede ser `SUCCEEDED`, `FAILED`, `DENIED` o `CONFIRMATION_REQUIRED`. El resultado es un campo contractual independiente, nunca texto concatenado al mensaje del usuario.

## Respuesta

Sin tools, el response es exactamente el flujo v1/v1.1. Con tools, `parsedOutput` contiene el resultado de dominio para `RESPOND`, o `null` y aparece `orchestration` para `CALL_TOOL`:

```json
{"orchestration":{"action":"CALL_TOOL","toolCall":{"toolCallId":"...","toolName":"consultar_disponibilidad","arguments":{"date":"2026-08-18"},"requiresConfirmation":false}}}
```

Sólo se permite una solicitud por ejecución. El caller ejecuta la herramienta y luego envía un nuevo run con `toolResult`; el Engine no hace loop.

Inicialmente se contempla lead y support. El contrato es neutral y landing/proposal conservan su comportamiento existente si no se habilitan tools.
