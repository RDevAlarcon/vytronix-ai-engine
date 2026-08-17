# RAG Context Contract v1.1

Fase E extiende `POST /api/agents/run` sin cambiar su URL ni su response envelope.

## Request

El campo opcional `ragContext` vive al mismo nivel que `agent`, `input` y `mode`:

```json
{
  "agent": "support",
  "input": {
    "ticketMessage": "¿Cuál es el horario de atención?"
  },
  "mode": "standard",
  "ragContext": {
    "items": [
      {
        "content": "Atendemos de lunes a viernes de 09:00 a 17:00."
      }
    ]
  }
}
```

Cada item requiere `content`. Puede incluir opcionalmente `sourceId`, `documentId`, `chunkId` y `score` para trazabilidad de la solicitud, pero esa metadata no se envía al modelo.

Límites v1.1:

- máximo 8 items;
- máximo 4000 caracteres por `content`;
- máximo 16000 caracteres totales;
- `content` no puede estar vacío;
- `score`, si existe, debe estar entre 0 y 1.

`ragContext` ausente y `{ "items": [] }` significan sin contexto recuperado y no agregan ningún bloque al prompt. Los límites del request global de 128 KiB siguen aplicando.

## Compatibilidad

Requests v1 sin `ragContext` siguen siendo válidos y conservan el comportamiento anterior. Los campos actuales no se renombran ni eliminan. La respuesta continúa usando `success`, `data`, `runId`, `agent`, `parsedOutput`, `rawOutput` y `metadata`.

El Engine no recupera documentos, no crea embeddings, no consulta vector stores y no persiste Knowledge Base. VyAssistant sigue siendo responsable de retrieval, selección de chunks y aislamiento futuro.
