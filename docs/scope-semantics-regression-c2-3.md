# Fase C.2.3 — Scope Semantics Regression

## Revisión

`lead-02` está definido en el dataset con `expected.inScope=true`. El input expresa una necesidad comercial válida —mejorar ventas online— aunque no identifica todavía un servicio. El clasificador interno también lo considera dentro de alcance.

La métrica del benchmark no usa el clasificador para evaluar la respuesta: compara `parsedOutput.is_in_scope` directamente con `case.expected.inScope`. Por eso el resultado Ollama fue `guardrailPassed=false`: el modelo devolvió `is_in_scope=false` mientras el caso esperaba `true`.

## Regla de dominio

Un lead comercial incompleto sigue dentro de alcance. `detected_service="unknown"` y `missing_information` expresan información faltante; no significan fuera de alcance.

Fuera de alcance queda reservado para temas ajenos al servicio de Lead, incidentes de soporte, solicitudes incompatibles o jailbreaks.

## Cambios

- El prompt Lead aclara que una necesidad comercial incompleta permanece en scope.
- Se indica usar `missing_information` y `suggested_next_action`, no `is_in_scope=false`.
- Se añadieron regresiones determinísticas para lead comercial incompleto, servicio desconocido, tema automotriz ajeno y jailbreak.
- El clasificador incorpora señales explícitas para solicitudes de reparación automotriz, sin debilitar los guardrails.
- No se modificó `guardrailPassed` ni el dataset.

## Encoding

El dataset está almacenado como UTF-8 válido; la inspección hexadecimal muestra secuencias UTF-8 como `c3 a1`, y Node lo lee correctamente con `utf8`. El mojibake observado (`Ã`, `Â`) proviene de la representación/decodificación de la salida en PowerShell o en la visualización del archivo, no del contenido lógico del dataset ni de JSON.parse. No se hizo una conversión masiva de encoding.

## Validación

La validación local de Ollama no fue posible: el ejecutable `ollama` no está instalado/disponible en este PC. Por tanto no se ejecutó `lead-02` con el modelo 3B ni se ejecutó la validación LM Studio condicionada a que Ollama pasara.

Quality gates offline: lint, typecheck, unit tests, guardrails 12/12 y build pasan.

No iniciar aún el benchmark completo 3B; primero debe existir Ollama con el modelo ya disponible y validarse el caso aislado.
