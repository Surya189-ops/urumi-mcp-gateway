import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Pool, PoolClient, QueryResult } from "pg";
import { runMigrations } from "./migrate.js";

interface QueryCall {
  sql: string;
  values?: unknown[];
}

function createMockPool(options: {
  applied?: string[];
  failOnMigration?: boolean;
} = {}) {
  const applied = new Set(options.applied ?? []);
  const calls: QueryCall[] = [];
  let released = false;

  const client = {
    async query(sql: string, values?: unknown[]) {
      calls.push({ sql, values });

      if (sql.includes("SELECT filename FROM schema_migrations")) {
        const filename = String(values?.[0]);
        return {
          rowCount: applied.has(filename) ? 1 : 0,
          rows: applied.has(filename) ? [{ filename }] : [],
        } as QueryResult;
      }

      if (sql.includes("INSERT INTO schema_migrations")) {
        if (options.failOnMigration) {
          throw new Error("simulated migration failure");
        }
        applied.add(String(values?.[0]));
      }

      return { command: "SELECT", rowCount: 0, oid: 0, rows: [], fields: [] } as QueryResult;
    },
    release() {
      released = true;
    },
  };

  const pool = {
    async connect() {
      return client;
    },
  } as unknown as Pool;

  return { pool, calls, applied, wasReleased: () => released };
}

async function createMigrationsDirectory(files: Record<string, string>) {
  const directory = await mkdtemp(join(tmpdir(), "urumi-migrations-"));
  await mkdir(directory, { recursive: true });

  for (const [filename, contents] of Object.entries(files)) {
    await writeFile(join(directory, filename), contents);
  }

  return directory;
}

test("applies pending migrations in filename order", async () => {
  const directory = await createMigrationsDirectory({
    "002_second.sql": "SELECT 2;",
    "001_first.sql": "SELECT 1;",
    "notes.txt": "not a migration",
  });
  const mock = createMockPool();

  try {
    const applied = await runMigrations(mock.pool, directory);

    assert.deepEqual(applied, ["001_first.sql", "002_second.sql"]);
    assert.deepEqual([...mock.applied], ["001_first.sql", "002_second.sql"]);
    assert.ok(mock.calls.some((call) => call.sql === "BEGIN"));
    assert.ok(mock.calls.some((call) => call.sql === "COMMIT"));
    assert.equal(mock.wasReleased(), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("skips migrations already recorded as applied", async () => {
  const directory = await createMigrationsDirectory({
    "001_first.sql": "SELECT 1;",
  });
  const mock = createMockPool({ applied: ["001_first.sql"] });

  try {
    const applied = await runMigrations(mock.pool, directory);

    assert.deepEqual(applied, []);
    assert.equal(
      mock.calls.some((call) => call.sql === "SELECT 1;"),
      false,
    );
    assert.equal(mock.wasReleased(), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rolls back and releases the client when recording a migration fails", async () => {
  const directory = await createMigrationsDirectory({
    "001_first.sql": "SELECT 1;",
  });
  const mock = createMockPool({ failOnMigration: true });

  try {
    await assert.rejects(
      runMigrations(mock.pool, directory),
      /simulated migration failure/,
    );

    assert.ok(mock.calls.some((call) => call.sql === "ROLLBACK"));
    assert.equal(mock.wasReleased(), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
