# Grounded Tool Arguments

Antes de ensamblar `CALL_TOOL`, los argumentos pasan validación estructural y
una validación de grounding. Los estados internos son `READY`,
`MISSING_INFORMATION`, `UNGROUNDED` e `INVALID`.

La política no inventa fechas, horas, IDs, nombres ni cantidades. `mañana`,
`hoy` y `pasado mañana` se normalizan únicamente a `tomorrow`, `today` y
`day_after_tomorrow`; no se usa la fecha del sistema para crear fechas ISO.
Una fecha absoluta sólo se conserva si existe evidencia textual suficiente.

Si falta un campo requerido o el valor no tiene evidencia, no se ensambla
`CALL_TOOL`; el flujo debe producir RESPOND solicitando los datos faltantes.
