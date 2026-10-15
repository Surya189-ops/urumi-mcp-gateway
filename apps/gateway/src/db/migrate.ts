import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool, PoolClient } from "pg";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const defaultMigrationsDirectory = resolve(sourceDirectory, "../../migrations");

async function executeMigration(
  client: PoolClient,
  filename: string,
  sql: string,
): Promise<void> {
  await client.query("BEGIN");

  try {
    await client.query(sql);
    await client.query(
      "INSERT INTO schema_migrations (filename) VALUES ($1)",
      [filename],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

export async function runMigrations(
  pool: Pool,
  migrationsDirectory = defaultMigrationsDirectory,
): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const filenames = (await readdir(migrationsDirectory))
      .filter((filename) => /^\d+_[a-z0-9_-]+\.sql$/.test(filename))
      .sort();

    for (const filename of filenames) {
      const existing = await client.query(
        "SELECT filename FROM schema_migrations WHERE filename = $1",
        [filename],
      );

      if (existing.rowCount && existing.rowCount > 0) {
        continue;
      }

      const sql = await readFile(
        resolve(migrationsDirectory, filename),
        "utf8",
      );

      await executeMigration(client, filename, sql);
      applied.push(filename);
    }

    return applied;
  } finally {
    client.release();
  }
}
