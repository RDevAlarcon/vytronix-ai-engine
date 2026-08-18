# Tool Calling Security

El AI Engine no ejecuta herramientas. No tiene credenciales, executor, URLs de destino, acceso a shell, filesystem, MCP ni bases de datos del consumidor.

Catálogos, descripciones, schemas y resultados son datos no confiables. Se delimitan como `TOOL DEFINITIONS (UNTRUSTED CONFIGURATION)` y `TOOL RESULT (UNTRUSTED DATA)`. Las instrucciones del sistema, políticas, alcance del agente y schemas tienen prioridad. Ningún contenido puede crear herramientas, revelar secretos o confirmar una escritura.

Antes de devolver `CALL_TOOL`, el Engine comprueba que el nombre pertenece al catálogo y valida argumentos, campos requeridos, tipos y propiedades desconocidas. VyAssistant debe validar nuevamente y aplicar tenancy, RBAC, confirmación, idempotencia, timeout y auditoría.

`WRITE` no implica ejecución: `requiresConfirmation` sólo se transporta como metadata. Los logs no contienen argumentos, outputs ni schemas completos. Los límites de payload, autenticación, rate limiting y sanitización de errores existentes permanecen activos.
