# Deterministic RESPOND Assembly

Cuando la acción ya es RESPOND, el modelo genera únicamente el domain output
del agente. El Engine valida ese objeto con el schema funcional y aplica
`assembleRespond`:

```json
{ "action": "RESPOND", "result": "<validated domain output>" }
```

No se pide al modelo que recuerde el envelope. Esto se aplica a `NO_TOOL` del
selector, ToolResult y missing-information. `CALL_TOOL` continúa ensamblándose
determinísticamente después de selección, grounding y validación.

El native no-tool decision sigue siendo una etapa separada. Si no recibe
`tool_calls`, intenta generar el domain output sin native tools; el proveedor no
relaja su regla general de contenido vacío.
