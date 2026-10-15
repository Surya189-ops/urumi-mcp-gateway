import assert from "node:assert/strict";
import test from "node:test";
import {
  createDatabasePool,
  createDatabasePoolFromEnv,
} from "./pool.js";

test("returns null when DATABASE_URL is missing", () => {
  assert.equal(createDatabasePoolFromEnv({}), null);
});

test("returns null when DATABASE_URL is blank", () => {
  assert.equal(createDatabasePoolFromEnv({ DATABASE_URL: "  " }), null);
});

test("creates a pool from DATABASE_URL", async () => {
  const pool = createDatabasePoolFromEnv({
    DATABASE_URL: "postgresql://user:password@127.0.0.1:5432/urumi_test",
  });

  assert.ok(pool);

  try {
    assert.equal(pool.options.connectionString,
      "postgresql://user:password@127.0.0.1:5432/urumi_test");
    assert.equal(pool.options.max, 10);
    assert.equal(pool.options.connectionTimeoutMillis, 5000);
  } finally {
    await pool.end();
  }
});

test("allows database pool options to be configured", async () => {
  const pool = createDatabasePool({
    connectionString: "postgresql://user:password@127.0.0.1:5432/urumi_test",
    max: 3,
    connectionTimeoutMillis: 1000,
  });

  try {
    assert.equal(pool.options.max, 3);
    assert.equal(pool.options.connectionTimeoutMillis, 1000);
  } finally {
    await pool.end();
  }
});
