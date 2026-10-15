import assert from "node:assert/strict";
import test from "node:test";
import type { Pool, QueryResult } from "pg";
import { PostgresUpstreamRepository } from "./postgres-upstream-repository.js";

interface Row {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
}

function createMockPool(
  handler: (sql: string, values?: unknown[]) => unknown,
): Pool {
  return {
    query: async (sql: string, values?: unknown[]) => ({
      rows: handler(sql, values) as Row[],
      rowCount: 1,
    }),
  } as unknown as Pool;
}

const store: Row = {
  id: "store-1",
  name: "Demo Store",
  url: "http://localhost:4000/mcp",
  enabled: true,
};

test("lists upstreams without exposing credentials", async () => {
  const pool = createMockPool((sql) => {
    assert.match(sql, /SELECT id, name, url, enabled/);
    assert.match(sql, /ORDER BY created_at, id/);
    assert.doesNotMatch(sql, /credentials/);
    return [store];
  });

  const repository = new PostgresUpstreamRepository(pool);
  assert.deepEqual(await repository.list(), [store]);
});

test("returns an upstream by ID using a parameterized query", async () => {
  const pool = createMockPool((sql, values) => {
    assert.match(sql, /WHERE id = \$1/);
    assert.deepEqual(values, ["store-1"]);
    return [store];
  });

  const repository = new PostgresUpstreamRepository(pool);
  assert.deepEqual(await repository.get("store-1"), store);
});

test("returns undefined when an upstream does not exist", async () => {
  const pool = createMockPool(() => []);
  const repository = new PostgresUpstreamRepository(pool);

  assert.equal(await repository.get("missing"), undefined);
});

test("creates an upstream with parameterized values", async () => {
  const pool = createMockPool((sql, values) => {
    assert.match(sql, /INSERT INTO upstream_servers/);
    assert.match(sql, /VALUES \(\$1, \$2, \$3, \$4\)/);
    assert.deepEqual(values, [
      store.id,
      store.name,
      store.url,
      store.enabled,
    ]);
    return [store];
  });

  const repository = new PostgresUpstreamRepository(pool);
  assert.deepEqual(await repository.create(store), store);
});

test("updates only supplied fields", async () => {
  const updated = { ...store, name: "Updated Store" };
  const pool = createMockPool((sql, values) => {
    assert.match(sql, /UPDATE upstream_servers/);
    assert.match(sql, /updated_at = NOW\(\)/);
    assert.deepEqual(values, ["store-1", "Updated Store", null, null]);
    return [updated];
  });

  const repository = new PostgresUpstreamRepository(pool);
  assert.deepEqual(
    await repository.update("store-1", { name: "Updated Store" }),
    updated,
  );
});

test("returns undefined when updating a missing upstream", async () => {
  const pool = createMockPool(() => []);
  const repository = new PostgresUpstreamRepository(pool);

  assert.equal(
    await repository.update("missing", { enabled: false }),
    undefined,
  );
});

test("deletes an upstream using a parameterized query", async () => {
  let receivedValues: unknown[] | undefined;
  const pool = {
    query: async (sql: string, values?: unknown[]) => {
      assert.match(sql, /DELETE FROM upstream_servers WHERE id = \$1/);
      receivedValues = values;
      return { command: "DELETE", rowCount: 1, oid: 0, rows: [], fields: [] } as QueryResult;
    },
  } as unknown as Pool;

  const repository = new PostgresUpstreamRepository(pool);

  assert.equal(await repository.delete("store-1"), true);
  assert.deepEqual(receivedValues, ["store-1"]);
});

test("returns false when deleting a missing upstream", async () => {
  const pool = {
    query: async () => ({ rows: [], rowCount: 0 }),
  } as unknown as Pool;

  const repository = new PostgresUpstreamRepository(pool);
  assert.equal(await repository.delete("missing"), false);
});
