import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import { PostgresApiKeyRepository } from "./postgres-api-key-repository.js";

interface Row {
  id: string;
  user_id: string;
  name: string;
  key_hash: string;
  revoked_at: Date | null;
  last_used_at: Date | null;
  created_at: Date;
}

const row: Row = {
  id: "11111111-1111-4111-8111-111111111111",
  user_id: "22222222-2222-4222-8222-222222222222",
  name: "Demo key",
  key_hash: "a".repeat(64),
  revoked_at: null,
  last_used_at: null,
  created_at: new Date("2026-10-15T12:00:00Z"),
};

function mockPool(
  handler: (sql: string, values?: unknown[]) => unknown[],
  rowCount = 1,
): Pool {
  return {
    query: async (sql: string, values?: unknown[]) => ({
      rows: handler(sql, values),
      rowCount,
    }),
  } as unknown as Pool;
}

test("creates a key record using parameterized values", async () => {
  const pool = mockPool((sql, values) => {
    assert.match(sql, /INSERT INTO api_keys/);
    assert.match(sql, /VALUES \(\$1, \$2, \$3, \$4\)/);
    assert.deepEqual(values, [
      row.id,
      row.user_id,
      row.name,
      row.key_hash,
    ]);
    return [row];
  });

  const repository = new PostgresApiKeyRepository(pool);
  const result = await repository.create({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    keyHash: row.key_hash,
  });

  assert.equal(result.id, row.id);
  assert.equal(result.userId, row.user_id);
  assert.equal(result.keyHash, row.key_hash);
});

test("throws if creating a key returns no row", async () => {
  const repository = new PostgresApiKeyRepository(
    mockPool(() => []),
  );

  await assert.rejects(
    repository.create({
      id: row.id,
      userId: row.user_id,
      name: row.name,
      keyHash: row.key_hash,
    }),
    /returned no row/,
  );
});

test("finds only active keys by hash", async () => {
  const repository = new PostgresApiKeyRepository(
    mockPool((sql, values) => {
      assert.match(sql, /key_hash = \$1 AND revoked_at IS NULL/);
      assert.deepEqual(values, [row.key_hash]);
      return [row];
    }),
  );

  assert.equal(
    (await repository.findActiveByHash(row.key_hash))?.id,
    row.id,
  );
});

test("returns undefined when no active key matches", async () => {
  const repository = new PostgresApiKeyRepository(mockPool(() => []));

  assert.equal(
    await repository.findActiveByHash("missing-hash"),
    undefined,
  );
});

test("lists keys only for the requested user", async () => {
  const repository = new PostgresApiKeyRepository(
    mockPool((sql, values) => {
      assert.match(sql, /WHERE user_id = \$1/);
      assert.match(sql, /ORDER BY created_at DESC, id/);
      assert.deepEqual(values, [row.user_id]);
      return [row];
    }),
  );

  assert.equal((await repository.listByUser(row.user_id)).length, 1);
});

test("updates last-used timestamp only for active keys", async () => {
  const repository = new PostgresApiKeyRepository(
    mockPool((sql, values) => {
      assert.match(sql, /SET last_used_at = NOW\(\)/);
      assert.match(sql, /revoked_at IS NULL/);
      assert.deepEqual(values, [row.id]);
      return [];
    }),
  );

  await repository.markUsed(row.id);
});

test("revokes a key only when it belongs to the specified user", async () => {
  const repository = new PostgresApiKeyRepository(
    mockPool((sql, values) => {
      assert.match(sql, /SET revoked_at = NOW\(\)/);
      assert.match(sql, /id = \$1/);
      assert.match(sql, /user_id = \$2/);
      assert.match(sql, /revoked_at IS NULL/);
      assert.deepEqual(values, [row.id, row.user_id]);
      return [];
    }),
  );

  assert.equal(await repository.revoke(row.id, row.user_id), true);
});

test("returns false when a key cannot be revoked", async () => {
  const repository = new PostgresApiKeyRepository(
    mockPool(() => [], 0),
  );

  assert.equal(await repository.revoke(row.id, row.user_id), false);
});
