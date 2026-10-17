import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import { PostgresAuditRepository } from "./postgres-audit-repository.js";

const userId = "22222222-2222-4222-8222-222222222222";
const createdAt = new Date("2026-10-17T03:00:00Z");

const row = {
  id: "1",
  user_id: userId,
  upstream_id: "woo-store",
  tool_name: "list_orders",
  outcome: "success" as const,
  duration_ms: 42,
  error_message: null,
  created_at: createdAt,
};

function mockPool(
  handler: (sql: string, values?: unknown[]) => unknown[],
): Pool {
  return {
    query: async (sql: string, values?: unknown[]) => ({
      rows: handler(sql, values),
      rowCount: 1,
    }),
  } as unknown as Pool;
}

test("creates an audit entry using parameterized values", async () => {
  const repository = new PostgresAuditRepository(
    mockPool((sql, values) => {
      assert.match(sql, /INSERT INTO audit_logs/);
      assert.match(sql, /RETURNING/);
      assert.deepEqual(values, [
        userId,
        "woo-store",
        "list_orders",
        "success",
        42,
        null,
      ]);
      return [row];
    }),
  );

  const result = await repository.create({
    userId,
    upstreamId: "woo-store",
    toolName: " list_orders ",
    outcome: "success",
    durationMs: 42,
  });

  assert.equal(result.userId, userId);
  assert.equal(result.toolName, "list_orders");
  assert.equal(result.outcome, "success");
  assert.equal(result.durationMs, 42);
  assert.equal(result.errorMessage, null);
});

test("rejects empty tool names", async () => {
  const repository = new PostgresAuditRepository(mockPool(() => []));

  await assert.rejects(
    repository.create({ toolName: "  ", outcome: "success" }),
    /toolName must not be empty/,
  );
});

test("rejects negative or fractional durations", async () => {
  const repository = new PostgresAuditRepository(mockPool(() => []));

  for (const durationMs of [-1, 1.5]) {
    await assert.rejects(
      repository.create({
        toolName: "list_orders",
        outcome: "success",
        durationMs,
      }),
      /durationMs must be a non-negative integer/,
    );
  }
});

test("rejects error messages on successful audit entries", async () => {
  const repository = new PostgresAuditRepository(mockPool(() => []));

  await assert.rejects(
    repository.create({
      toolName: "list_orders",
      outcome: "success",
      errorMessage: "unexpected",
    }),
    /cannot have an error message/,
  );
});

test("lists newest audit entries with a bounded parameterized limit", async () => {
  const repository = new PostgresAuditRepository(
    mockPool((sql, values) => {
      assert.match(sql, /ORDER BY created_at DESC, id DESC/);
      assert.match(sql, /LIMIT \$1/);
      assert.deepEqual(values, [25]);
      return [row];
    }),
  );

  assert.equal((await repository.list({ limit: 25 })).length, 1);
});

test("filters audit entries by user", async () => {
  const repository = new PostgresAuditRepository(
    mockPool((sql, values) => {
      assert.match(sql, /WHERE user_id = \$1/);
      assert.match(sql, /LIMIT \$2/);
      assert.deepEqual(values, [userId, 100]);
      return [row];
    }),
  );

  assert.equal((await repository.list({ userId })).length, 1);
});

test("rejects out-of-range list limits", async () => {
  const repository = new PostgresAuditRepository(mockPool(() => []));

  for (const limit of [0, 501, 1.5]) {
    await assert.rejects(
      repository.list({ limit }),
      /between 1 and 500/,
    );
  }
});
