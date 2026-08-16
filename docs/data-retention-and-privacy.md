# Data retention and privacy

`agent_runs` currently stores the complete input, raw model output, parsed
output, execution metadata, errors, quality signals and operator feedback.
This is intentional for current traceability and has not been removed in
Phase A.

Inputs may contain personal or commercially sensitive information. The API
does not claim to anonymize arbitrary business data. Known field-level input
limits reduce accidental oversized storage, but they are not a PII policy.

Operational requirements still outstanding:

- define retention periods and deletion jobs;
- classify and redact PII by data owner policy;
- implement access controls before external exposure;
- support subject/business deletion where required;
- add tenant scoping when multi-tenancy is introduced;
- review raw-output storage and database backups.

Phase A keeps existing traceability and does not silently destroy useful
business context. No secrets should be submitted as agent input.
