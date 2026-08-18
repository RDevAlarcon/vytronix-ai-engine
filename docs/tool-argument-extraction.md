# Tool Argument Extraction

El selector V2 sólo decide `NO_TOOL` o `USE_TOOL` y el nombre allowlisted. Para
`USE_TOOL`, `ToolArgumentExtractor` recibe únicamente input original, descripción
mínima y schema de una Tool. No recibe RAG completo, otras Tools, ToolResult ni
schemas de agente.

La salida se valida contra el input schema, con máximo un repair. Si faltan
campos requeridos se clasifica como `MISSING_INFORMATION`; no se inventan
valores ni se construye `CALL_TOOL`. Los errores restantes son
`TOOL_ARGUMENTS_INVALID`.
