import assert from "node:assert/strict";
import test from "node:test";
import type { Pool, PoolClient } from "pg";
import { bootstrapInitialAdmin } from "./bootstrap-admin.js";
import { hashApiKey, hasValidApiKeyFormat } from "./api-key.js";

interface QueryCall {
  sql: string;
  values?: unknown[];
}

function mockDatabase(options?: {
  existingUsers?: boolean;
  failOnApiKeyInsert?: boolean;
}) {
  const calls: QueryCall[] = [];
  const client = {
    query: async (sql: string, values?: unknown[]) => {
      calls.push({ sql, values });

      if (/SELECT id FROM users LIMIT 1/.test(sql)) {
        return {
          rows: options?.existingUsers ? [{ id: "existing-user" }] : [],
          rowCount: options?.existingUsers ? 1 : 0,
        };
      }

      if (
        options?.failOnApiKeyInsert &&
        /INSERT INTO api_keys/.test(sql)
      ) {
        throw new Error("simulated API-key insert failure");
      }

      return { rows: [], rowCount: 1 };
    },
    release: () => undefined,
  };

  const pool = {
    connect: async () => client,
  } as unknown as Pool;

  return { pool, calls };
}

test("rejects invalid email before connecting to the database", async () => {
  let connected = false;
  const pool = {
    connect: async () => {
      connected = true;
      throw new Error("should not connect");
    },
  } as unknown as Pool;

  await assert.rejects(
    bootstrapInitialAdmin(pool, {
      email: "invalid-email",
      displayName: "Initial Admin",
    }),
    /valid admin email/,
  );
  assert.equal(connected, false);
});

test("rejects an empty display name before connecting", async () => {
  let connected = false;
  const pool = {
    connect: async () => {
      connected = true;
      throw new Error("should not connect");
    },
  } as unknown as Pool;

  await assert.rejects(
    bootstrapInitialAdmin(pool, {
      email: "admin@example.test",
      displayName: "  ",
    }),
    /display name is required/,
  );
  assert.equal(connected, false);
});

test("creates the initial admin and stores only the API-key hash", async () => {
  const { pool, calls } = mockDatabase();

  const result = await bootstrapInitialAdmin(pool, {
    email: " ADMIN@EXAMPLE.TEST ",
    displayName: "Initial Admin",
  });

  assert.equal(result.email, "admin@example.test");
  assert.ok(result.userId);
  assert.ok(result.apiKeyId);
  assert.equal(hasValidApiKeyFormat(result.apiKey), true);

  const userInsert = calls.find((call) =>
    /INSERT INTO users/.test(call.sql),
  );
  assert.ok(userInsert);
  assert.equal(userInsert.values?.[1], "admin@example.test");
  assert.equal(userInsert.values?.[2], "Initial Admin");
  assert.equal(userInsert.values?.[3], undefined);
  assert.match(userInsert.sql, /'admin'/);

  const keyInsert = calls.find((call) =>
    /INSERT INTO api_keys/.test(call.sql),
  );
  assert.ok(keyInsert);
  assert.equal(keyInsert.values?.[0], result.apiKeyId);
  assert.equal(keyInsert.values?.[1], result.userId);
  assert.equal(keyInsert.values?.[3], hashApiKey(result.apiKey));
  assert.notEqual(keyInsert.values?.[3], result.apiKey);

  assert.ok(calls.some((call) => /BEGIN/.test(call.sql)));
  assert.ok(calls.some((call) => /COMMIT/.test(call.sql)));
  assert.ok(calls.some((call) => /pg_advisory_xact_lock/.test(call.sql)));
});

test("refuses bootstrap when any user already exists and rolls back", async () => {
  const { pool, calls } = mockDatabase({ existingUsers: true });

  await assert.rejects(
    bootstrapInitialAdmin(pool, {
      email: "admin@example.test",
      displayName: "Initial Admin",
    }),
    /users already exist/,
  );

  assert.equal(
    calls.some((call) => /INSERT INTO users/.test(call.sql)),
    false,
  );
  assert.ok(calls.some((call) => /ROLLBACK/.test(call.sql)));
  assert.equal(
    calls.some((call) => /INSERT INTO api_keys/.test(call.sql)),
    false,
  );
});

test("rolls back the admin insert if API-key creation fails", async () => {
  const { pool, calls } = mockDatabase({ failOnApiKeyInsert: true });

  await assert.rejects(
    bootstrapInitialAdmin(pool, {
      email: "admin@example.test",
      displayName: "Initial Admin",
    }),
    /simulated API-key insert failure/,
  );

  assert.ok(calls.some((call) => /INSERT INTO users/.test(call.sql)));
  assert.ok(calls.some((call) => /INSERT INTO api_keys/.test(call.sql)));
  assert.ok(calls.some((call) => /ROLLBACK/.test(call.sql)));
  assert.equal(calls.some((call) => /COMMIT/.test(call.sql)), false);
});
