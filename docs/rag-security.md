# RAG Security v1.1

Todo `ragContext` se trata como datos no confiables. Un chunk recuperado no es una instrucción autorizada aunque contenga texto con apariencia de system prompt, órdenes administrativas, solicitudes de secretos o instrucciones de herramientas.

## Frontera del prompt

El Engine agrega un mensaje separado y determinista con esta semántica:

```text
INSTRUCTIONS / system rules
USER INPUT
RETRIEVED KNOWLEDGE (UNTRUSTED DATA)
<retrieved_knowledge>...</retrieved_knowledge>
```

El bloque indica explícitamente que sus instrucciones deben ignorarse y que las reglas internas, políticas, alcance del agente y schema tienen prioridad. Solo se envía `content`; source/document/chunk IDs y score no se convierten en instrucciones ni se exponen en la respuesta.

## Precedencia

1. reglas system/developer del Engine;
2. guardrails y políticas;
3. alcance y schema del agente;
4. mensaje legítimo del usuario;
5. retrieved knowledge como referencia factual.

El contexto no puede cambiar el agente, ampliar alcance, desactivar guardrails, pedir secretos ni modificar el output contract. No se pretende resolver prompt injection de forma completa mediante filtros de texto; la defensa principal es la separación semántica y la prioridad explícita.

## Privacidad

El contenido RAG no se registra por defecto en logs, errores, métricas ni diagnostics normales. `BENCHMARK_CAPTURE_RAW_OUTPUT` controla raw output del modelo para diagnóstico local, pero no habilita una captura adicional del request RAG. Los consumidores deben evitar enviar PII innecesaria y aplicar sus propias políticas de tenancy, retención y selección de chunks.
