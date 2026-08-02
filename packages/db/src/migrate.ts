import { fileURLToPath } from "node:url";
import path from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

// Resolves relative to this file (works from src/ via tsx and from dist/
// after build, since the generated SQL folder sits one level up from both).
const MIGRATIONS_FOLDER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../drizzle");

/**
 * Applies every not-yet-applied migration in packages/db/drizzle. Safe to
 * call on every boot — drizzle tracks applied migrations in its own table
 * and this is a no-op once the schema is current. Used by the k3s init
 * container (Requirement 21/27) and, for local dev, by the server itself
 * at startup.
 */
export async function runMigrations(connectionString: string): Promise<void> {
  const migrationClient = postgres(connectionString, { max: 1 });
  try {
    await migrate(drizzle(migrationClient), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await migrationClient.end();
  }
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL must be set to run migrations.");
  }
  await runMigrations(connectionString);
  console.log("Migrations applied.");
}

// Only run as a script when invoked directly (`node dist/migrate.js`), not
// when imported by the server or by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("Migration failed", error);
    process.exit(1);
  });
}
