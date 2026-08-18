# Domain response generation

El native tool decision sólo decide si existe un `tool_call`. Si no existe,
la generación domain-only usa el prompt legacy del agente y el schema funcional
de `SupportOutput`/`LeadOutput`, sin `tools`, `tool_choice` ni instrucciones de
orchestration. El resultado validado se envuelve con `assembleRespond`.

El proveedor conserva `LLM_EMPTY_CONTENT` para requests domain-only vacías. La
única excepción es una respuesta vacía de una request que incluía native tools,
que representa `NO_TOOL` y permite iniciar la generación domain-only.
