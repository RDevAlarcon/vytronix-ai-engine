# Vytronix AI Engine v1.1

Fase E agrega soporte contractual opcional para contexto recuperado externo mediante `ragContext` en `POST /api/agents/run`.

La evolución mantiene la separación arquitectónica:

```text
VyAssistant: ingestion / chunking / embeddings / retrieval / tenancy
        ↓
AI Engine: explicit ragContext / agent scope / reasoning / generation
```

El Engine no implementa retrieval, embeddings, vector DB, Knowledge Base ni conexión a la base de datos de VyAssistant. Todos los providers reciben el mismo prompt neutral; no existe lógica RAG específica para LM Studio u Ollama.

Support es el agente prioritario para consumo de conocimiento. La extensión contractual acepta el campo uniformemente para los cuatro agentes, pero no obliga a usar RAG donde no aporte valor. Lead puede usarlo para información de servicios o políticas comerciales, siempre como referencia no confiable.

La ausencia de contexto es completamente compatible con v1. Los límites, el contrato exacto y las reglas de seguridad están en [rag-context-contract-v1-1.md](rag-context-contract-v1-1.md) y [rag-security.md](rag-security.md).
