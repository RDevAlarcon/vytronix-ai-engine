# ADR: Structured tool calling contract

## Decisión

Implementar un contrato neutral basado en prompt y JSON validado, sin usar native function calling de LM Studio u Ollama. `tools` es un catálogo permitido por el caller; `toolResult` es el resultado de una ejecución externa.

## Motivo

VyAssistant ya posee la frontera de seguridad y ejecución. Mantenerla fuera del Engine evita credenciales, side effects y acoplamiento a proveedores. Un envelope `RESPOND`/`CALL_TOOL` preserva los schemas de dominio existentes.

## Límites

Una llamada por run, sin auto-loop. El futuro orquestador puede limitar hasta tres rondas por turno. La validación del Engine es defense-in-depth y no reemplaza la de VyAssistant.
