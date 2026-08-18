# Provider Structured Output

F.1.11 introduce una optimización interna opcional para generación estructurada.
El contrato externo continúa siendo `RESPOND`/`CALL_TOOL`; no se usan native
tool calls ni se ejecutan herramientas en el Engine.

## Capacidad

La solicitud LLM puede incluir `responseSchema`. Ollama lo traduce internamente
al endpoint OpenAI-compatible como:

```json
{
  "response_format": {
    "type": "json_schema",
    "json_schema": { "name": "vytronix_output", "strict": true, "schema": {} }
  }
}
```

LM Studio declara la capacidad como no soportada y conserva el fallback textual
existente. El agente y la ruta HTTP no conocen detalles de Ollama.

## Schemas forzados

Cuando el selector decide `NO_TOOL`, el agente recibe un schema `RESPOND`-only.
Cuando decide `USE_TOOL`, recibe `CALL_TOOL`-only con nombre, confirmación y
argumentos restringidos a la herramienta seleccionada. Con `ToolResult`, recibe
`RESPOND`-only. Zod, allowlist y validación de argumentos siguen ejecutándose
después de la respuesta del provider.

## Límites

No se utilizan `tools`, `tool_choice`, `message.tool_calls` ni `role=tool`.
No se envían schemas remotos ni se resuelven `$ref`. La capacidad es fallback
seguro: si no está soportada, continúa el flujo textual con repair.

## Resultado experimental F.1.11

El preflight de Ollama con Granite 4 3B produjo JSON único y `finish_reason`
`stop`. En las pruebas controladas, structured output eliminó la salida JSON
concatenada del selector y permitió first-pass estable en NO_TOOL, WRITE y
ToolResult. Sin embargo, RAG + Tool produjo repetidamente `TOOL_ARGUMENTS_INVALID`
porque el selector omitió el argumento requerido `date`; el repair no lo corrigió.
Por ello la optimización no se considera todavía apta para congelar RAG + Tool.
