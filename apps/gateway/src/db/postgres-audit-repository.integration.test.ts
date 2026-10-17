import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { PostgresAuditRepository } from "./postgres-audit-repository.js";

const databaseUrl = process.env.DATABASE_URL;

test(
  "persists and retrieves audit entries in PostgreSQL",
  { skip: !databaseUrl ? "DATABASE_URL is not configured" : false },
  async () => {
    const pool = new pg.Pool({ connectionString: databaseUrl });
    const repository = new PostgresAuditRepository(pool);
    const userId = randomUUID();
    const upstreamId = `audit-test-${randomUUID()}`;

    try {
      await pool.query(
        `INSERT INTO users (id, email, display_name, role)
         VALUES ($1, $2, $3, $4)`,
        [userId, `${userId}@integration.test`, "Audit Test User", "member"],
      );

      await pool.query(
        `INSERT INTO upstream_servers (id, name, url, enabled)
         VALUES ($1, $2, $3, $4)`,
        [upstreamId, "Audit Test Upstream", "http://127.0.0.1:9999/mcp", true],
      );

      const created = await repository.create({
        userId,
        upstreamId,
        toolName: "list_orders",
        outcome: "success",
        durationMs: 37,
      });

      assert.equal(created.userId, userId);
      assert.equal(created.upstreamId, upstreamId);
      assert.equal(created.toolName, "list_orders");
      assert.equal(created.outcome, "success");
      assert.equal(created.durationMs, 37);
      assert.equal(created.errorMessage, null);
      assert.ok(created.createdAt instanceof Date);

      const filtered = await repository.list({ userId, limit: 10 });
      assert.ok(filtered.some((entry) => entry.id === created.id));

      const persisted = await pool.query(
        `SELECT user_id, upstream_id, tool_name, outcome, duration_ms
         FROM audit_logs WHERE id = $1`,
        [created.id],
      );

      assert.equal(persisted.rowCount, 1);
      assert.equal(persisted.rows[0]?.user_id, userId);
      assert.equal(persisted.rows[0]?.upstream_id, upstreamId);
      assert.equal(persisted.rows[0]?.tool_name, "list_orders");
      assert.equal(persisted.rows[0]?.outcome, "success");
      assert.equal(persisted.rows[0]?.duration_ms, 37);
    } finally {
      await pool.query("DELETE FROM audit_logs WHERE user_id = $1", [userId])
        .catch(() => undefined);
      await pool.query("DELETE FROM upstream_servers WHERE id = $1", [upstreamId])
        .catch(() => undefined);
      await pool.query("DELETE FROM users WHERE id = $1", [userId])
        .catch(() => undefined);
      await pool.end();
    }
  },
);
