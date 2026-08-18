# Deterministic Tool Call Assembly

Después de que una Tool allowlisted y sus argumentos pasan validación,
`assembleToolCall` construye el envelope `CALL_TOOL` en código. El nombre,
argumentos y `requiresConfirmation` provienen del catálogo validado; el modelo
no puede sobrescribir confirmation ni side effects.

El assembly no ejecuta Tools y no cambia el contrato HTTP v1.2.
