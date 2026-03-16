import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { env } from "@/lib/env";

const globalForDb = globalThis as unknown as {
  postgresClient?: postgres.Sql;
};

const postgresClient =
  globalForDb.postgresClient ??
  postgres(env.DATABASE_URL, {
    prepare: false,
    max: 5
  });

if (env.NODE_ENV !== "production") {
  globalForDb.postgresClient = postgresClient;
}

export const db = drizzle(postgresClient, { schema });
export { postgresClient };
