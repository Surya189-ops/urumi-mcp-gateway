import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import { PostgresUserRepository } from "./postgres-user-repository.js";

const row = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "member@example.com",
  display_name: "Team Member",
  role: "member" as const,
  created_at: new Date("2026-10-15T12:00:00Z"),
  updated_at: new Date("2026-10-15T12:00:00Z"),
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

test("creates a user with normalized email and default role", async () => {
  const repository = new PostgresUserRepository(
    mockPool((sql, values) => {
      assert.match(sql, /INSERT INTO users/);
      assert.deepEqual(values, [
        row.id, "member@example.com", "Team Member", "member",
      ]);
      return [row];
    }),
  );
  const result = await repository.create({
    id: row.id,
    email: " MEMBER@EXAMPLE.COM ",
    displayName: " Team Member ",
  });
  assert.equal(result.email, row.email);
  assert.equal(result.role, "member");
});

test("throws if creation returns no row", async () => {
  const repository = new PostgresUserRepository(mockPool(() => []));
  await assert.rejects(
    repository.create({
      id: row.id, email: row.email, displayName: row.display_name,
    }),
    /Creating the user returned no row/,
  );
});

test("finds a user by parameterized ID", async () => {
  const repository = new PostgresUserRepository(
    mockPool((sql, values) => {
      assert.match(sql, /WHERE id = \$1/);
      assert.deepEqual(values, [row.id]);
      return [row];
    }),
  );
  assert.equal((await repository.findById(row.id))?.email, row.email);
});

test("returns undefined for a missing user", async () => {
  const repository = new PostgresUserRepository(mockPool(() => []));
  assert.equal(await repository.findById(row.id), undefined);
});

test("lists users in stable order", async () => {
  const repository = new PostgresUserRepository(
    mockPool((sql) => {
      assert.match(sql, /ORDER BY created_at ASC, id ASC/);
      return [row];
    }),
  );
  assert.equal((await repository.list()).length, 1);
});

test("updates a user's role and timestamp", async () => {
  const repository = new PostgresUserRepository(
    mockPool((sql, values) => {
      assert.match(sql, /updated_at = NOW\(\)/);
      assert.deepEqual(values, [row.id, "admin"]);
      return [{ ...row, role: "admin" }];
    }),
  );
  assert.equal((await repository.updateRole(row.id, "admin"))?.role, "admin");
});

test("returns undefined when updating a missing user", async () => {
  const repository = new PostgresUserRepository(mockPool(() => []));
  assert.equal(await repository.updateRole(row.id, "member"), undefined);
});
