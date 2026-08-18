# Tool orchestration prompt hierarchy

## Cause

The agent prompts contain a legacy root-output instruction (`Required JSON shape`) in the system message. The initial tool contract was appended later as user/context content. This created a priority conflict: models commonly returned the valid domain JSON directly instead of the orchestration envelope.

## Effective hierarchy

Without tools, the original v1/v1.1 messages and domain root schema are unchanged.

With tools, the system message is composed as:

1. agent role, scope, safety and field semantics;
2. orchestration root contract (`RESPOND` or `CALL_TOOL`);
3. allowlist and tool-selection rules;
4. ToolResult state rule, when present.

The legacy root schema section is removed only from the tools-active system copy. The domain schema remains the required shape of `RESPOND.result` and is still enforced by the existing Zod union. The system contract explicitly requires `RESPOND.result` to be a complete JSON object with every required field; plain text strings are invalid. A compact JSON Schema generated from the active agent schema is included once as the schema for `RESPOND.result`.

Later user/reference messages contain the original input, retrieved knowledge, tool definitions and ToolResult. These remain untrusted data and cannot override system rules.

La selección de Tool ocurre antes de la generación final. Su decisión validada es autoritativa: `NO_TOOL` prohíbe `CALL_TOOL` y `USE_TOOL` exige la herramienta seleccionada. Esto evita que el agente principal vuelva a decidir contradictoriamente.

## Compatibility and security

Requests without tools retain v1/v1.1 behavior. No provider, HTTP contract, ToolDefinition or ToolResult schema changes. Tool descriptions, RAG and ToolResult remain untrusted; the Engine still never executes tools.
