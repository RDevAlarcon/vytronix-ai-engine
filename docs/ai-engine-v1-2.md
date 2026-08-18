# Vytronix AI Engine v1.2

v1.2 añade structured tool calling opcional al endpoint v1. La evolución conserva v1 sin `ragContext` y v1.1 con `ragContext`; ambos siguen sin tools y mantienen sus respuestas.

El Engine decide entre respuesta final y una única solicitud de herramienta. VyAssistant sigue siendo responsable de autorización, ejecución, secretos, tenancy, confirmaciones, idempotencia y auditoría. No hay retrieval, ejecución de tools, native function calling ni provider-specific implementation en esta versión.

Flujo: `Agent → LlmService → LlmProvider`, con los bloques separados de instrucciones, user input, retrieved knowledge, tool definitions y tool result. Structured output continúa usando extracción JSON, Zod y como máximo un repair.
