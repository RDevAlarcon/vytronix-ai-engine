# Database Migrations

Las migraciones versionadas se generan en `/drizzle` usando `drizzle-kit`.
Esta carpeta se reserva para scripts manuales extraordinarios si fueran necesarios.

La aplicación no ejecuta migraciones automáticamente al iniciar. En despliegues,
ejecutar explícitamente `npm run db:migrate` como paso aprobado antes de arrancar
la aplicación. En desarrollo local también se puede ejecutar ese comando después
de levantar PostgreSQL.
