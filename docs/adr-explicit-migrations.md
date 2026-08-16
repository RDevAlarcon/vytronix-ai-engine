# ADR: Explicit database migrations

Status: accepted for Phase A

Application startup does not mutate the database schema. Deployments run
`npm run db:migrate` as an explicit, approved step before `npm run start`.
This makes schema changes visible and avoids every application restart acting
as a migration operation.
