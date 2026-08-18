# Hybrid Tool Routing

## Resultado F.1.13

Granite 4 3B mantuvo READ y WRITE simples en native con 3/3 first-pass. NO_TOOL
simple falló 0/3 por contenido vacío sin `tool_calls`. RAG-only pasó 3/3 por
selector y ToolResult pasó 3/3. RAG + Tool fue correctamente enrutado al
selector, pero obtuvo 0/5 porque Structured Outputs omitió el argumento
requerido `date`, reproduciendo F.1.11. La estrategia queda diagnosticada, no
validada para cierre.

F.1.13 mantiene un único contrato HTTP v1.2 y selecciona internamente la ruta
de generación:

| Condición | Ruta |
|---|---|
| `toolResult` presente | `TOOL_RESULT_RESPOND` |
| sin tools | `LEGACY` |
| tools + items RAG | `SELECTOR` |
| tools sin RAG + provider native | `NATIVE` |
| tools sin RAG + provider sin native | `SELECTOR` |

`ragContext.items=[]` equivale a ausencia de RAG. La decisión es pura y no hace
otra inferencia. El camino native sólo genera una solicitud; no ejecuta Tools.
El camino selector conserva Structured Outputs, enforcement y repair como
fallback robusto para casos compuestos.

La estrategia no aparece en la respuesta HTTP. `RESPOND` y `CALL_TOOL` siguen
siendo las únicas formas externas. `requiresConfirmation` se deriva del
catálogo de Tools y no del modelo.
