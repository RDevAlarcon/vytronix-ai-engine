# Fase A.1 — Dependency Security Remediation

## Controlled updates

| Package | Before | After | Reason | Compatibility risk |
|---|---:|---:|---|---|
| `next` | 16.0.10 | 16.3.1 | Resolves the audited Next.js high-severity advisories and refreshes vulnerable transitive packages. Stable release; React 19, App Router, Route Handlers and Node 20 remain supported. | Low to moderate; validated with build and existing routes. |
| `drizzle-orm` | 0.44.7 installed (`^0.44.5`) | 0.45.2 | Resolves GHSA-gpj5-g38j-94v9 concerning SQL identifier escaping. | Low to moderate; schemas and repositories compile; no migrations were run. |

`drizzle-kit` remains at `0.31.9`; it was not implicated by the production audit
and no alignment change was necessary.

## Transitive remediation

Updating Next.js refreshed the transitive packages:

- `nanoid`: 3.3.11 → 3.3.18;
- `postcss`: 8.4.31 / 8.5.8 → 8.5.23;
- `sharp`: 0.34.5 → 0.35.3.

They are not direct dependencies and no overrides were added.

## Validation

The final `npm audit --omit=dev` result is:

```text
0 critical, 0 high, 0 moderate, 0 low
```

No `npm audit fix`, `npm audit fix --force`, migrations, commits or pushes
were performed.
