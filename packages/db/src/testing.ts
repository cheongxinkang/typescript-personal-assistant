import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { createDatabase, type Database } from "./client.js";
import { runMigrations } from "./migrate.js";

export interface TestDatabase {
  database: Database;
  teardown: () => Promise<void>;
}

/**
 * Starts a real, ephemeral Postgres via Testcontainers and applies every
 * checked-in migration — proves the SQL in packages/db/drizzle is actually
 * valid, not just that drizzle-kit accepted the schema. Used only by
 * integration tests; never imported by apps/server.
 */
export async function startTestDatabase(): Promise<TestDatabase> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    "postgres:16-alpine",
  ).start();

  const connectionString = container.getConnectionUri();
  await runMigrations(connectionString);
  const database = createDatabase(connectionString);

  return {
    database,
    teardown: async () => {
      await database.client.end();
      await container.stop();
    },
  };
}
