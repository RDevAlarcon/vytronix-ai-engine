# Ollama Native Tool Calling

F.1.12 añade un camino interno opcional para Ollama. El provider traduce el
catálogo neutral a `tools` del endpoint OpenAI-compatible y normaliza
`message.tool_calls` a `LlmToolCall`. El contrato público continúa usando
`CALL_TOOL` y `RESPOND`.

## Límites

El Engine no ejecuta herramientas. No usa callbacks, URLs, shell, filesystem,
MCP ni `role=tool` para ejecutar nada. Sólo genera una solicitud para el caller.
Se acepta como máximo una llamada por ejecución; múltiples llamadas se rechazan.
La allowlist, el schema de argumentos y `requiresConfirmation` se validan en el
Engine, y la confirmación efectiva sigue siendo responsabilidad del caller.

Ollama declara `supportsNativeToolCalling=true`. LM Studio declara `false` y
conserva el camino selector + structured/textual fallback. No hay detalles de
Ollama en el contrato HTTP ni en VyAssistant.

## Preflight real

Granite 4 3B devolvió `message.tool_calls` con `name=consultar_disponibilidad`,
`arguments.date` presente y `finish_reason=tool_calls`. Un follow-up con mensaje
assistant/tool produjo una respuesta final normal.

La combinación `tools + response_format` fue aceptada por HTTP, pero el modelo
priorizó el structured response y devolvió contenido `RESPOND`; por eso el camino
native no combina ambos mecanismos.

## Validación Granite 4 3B

READ obtuvo 3/3 `CALL_TOOL` first-pass y WRITE obtuvo 3/3 first-pass, incluyendo
`requiresConfirmation` derivado del catálogo. RAG + Tool obtuvo 1/5: en cuatro
ejecuciones el modelo respondió sin solicitar la herramienta. Esto mantiene
fallida la selección native en escenarios compuestos.

El follow-up contractual con `toolResult` fue 3/3 `RESPOND`, pero el router
actual lo procesa por el camino estructurado/fallback porque el request v1.2 no
transporta el historial assistant tool-call completo. No se ejecutó ninguna Tool.
