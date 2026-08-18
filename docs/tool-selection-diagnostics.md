# Tool Selection Diagnostics

F.1.10 añade observabilidad interna y opt-in para separar el Tool Selector de la orquestación del agente. No cambia el contrato HTTP, los schemas públicos ni la ejecución de herramientas.

Se registran internamente `selectorUsed`, `selectorSkipped`, `selectorDecision`, `selectedToolName`, attempts, repair, validez, `selectorDurationMs`, `agentDurationMs` y `totalDurationMs`. `durationMs` se conserva por compatibilidad. El selector se omite sin tools o cuando existe `toolResult`.

También se registra `finalAction`, `enforcementPassed`, `argumentsPresent`,
`argumentsValid` y `argumentIssueCount`, para distinguir selección, seguimiento
de la decisión y validación de argumentos. Estos datos son internos.

Los diagnostics no se exponen por HTTP ni se persisten por defecto. `TOOL_DIAGNOSTICS_CAPTURE_RAW_OUTPUT=true` es sólo local/desarrollo y usa el límite existente de 4.000 caracteres con truncation flag. El modo normal no registra mensajes, chunks RAG completos ni ToolResult completo.

`TOOL_CALL_INVALID` cubre contradicción NO_TOOL/CALL_TOOL, contradicción USE_TOOL/RESPOND, selección de otra herramienta y solicitudes de herramienta posteriores a un ToolResult. Allowlist y argumentos siguen validándose con las reglas existentes.
