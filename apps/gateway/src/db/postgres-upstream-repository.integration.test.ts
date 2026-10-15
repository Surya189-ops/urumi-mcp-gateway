import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { PostgresUpstreamRepository } from "./postgres-upstream-repository.js";

const databaseUrl = process.env.DATABASE_URL;

test(
  "persists upstream CRUD operations in PostgreSQL",
  { skip: !databaseUrl ? "DATABASE_URL is not configured" : false },
  async () => {
    const pool = new pg.Pool({ connectionString: databaseUrl });
    const repository = new PostgresUpstreamRepository(pool);
    const id = `integration-${randomUUID()}`;

    try {
      const created = await repository.create({
        id,
        name: "Integration Test",
        url: "http://127.0.0.1:9999/mcp",
        enabled: true,
      });

      assert.equal(created.id, id);
      assert.deepEqual(await repository.get(id), created);
      assert.ok((await repository.list()).some((item) => item.id === id));

      const updated = await repository.update(id, {
        name: "Integration Test Updated",
        enabled: false,
      });

      assert.equal(updated?.name, "Integration Test Updated");
      assert.equal(updated?.enabled, false);

      assert.equal(await repository.delete(id), true);
      assert.equal(await repository.get(id), undefined);
      assert.equal(await repository.delete(id), false);
    } finally {
      await pool.query("DELETE FROM upstream_servers WHERE id = $1", [id]).catch(() => undefined);
      await pool.end();
    }
  },
);
