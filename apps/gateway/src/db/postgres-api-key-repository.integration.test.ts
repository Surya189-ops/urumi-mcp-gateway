import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { PostgresApiKeyRepository } from "./postgres-api-key-repository.js";

const databaseUrl = process.env.DATABASE_URL;

test(
  "persists API-key creation, lookup, usage, listing, and revocation in PostgreSQL",
  { skip: !databaseUrl ? "DATABASE_URL is not configured" : false },
  async () => {
    const pool = new pg.Pool({ connectionString: databaseUrl });
    const repository = new PostgresApiKeyRepository(pool);
    const userId = randomUUID();
    const keyId = randomUUID();
    const keyHash = randomUUID().replaceAll("-", "").padEnd(64, "a");

    try {
      await pool.query(
        `INSERT INTO users (id, email, display_name, role)
         VALUES ($1, $2, $3, $4)`,
        [userId, `${userId}@integration.test`, "Integration Test", "member"],
      );

      const created = await repository.create({
        id: keyId,
        userId,
        name: "Integration API key",
        keyHash,
      });

      assert.equal(created.id, keyId);
      assert.equal(created.userId, userId);
      assert.equal(created.keyHash, keyHash);
      assert.equal(created.revokedAt, null);

      const found = await repository.findActiveByHash(keyHash);
      assert.equal(found?.id, keyId);

      const listed = await repository.listByUser(userId);
      assert.equal(listed.length, 1);
      assert.equal(listed[0]?.id, keyId);

      await repository.markUsed(keyId);
      const used = await repository.findActiveByHash(keyHash);
      assert.ok(used?.lastUsedAt instanceof Date);

      assert.equal(await repository.revoke(keyId, userId), true);
      assert.equal(await repository.findActiveByHash(keyHash), undefined);
      assert.equal(await repository.revoke(keyId, userId), false);

      const historical = await repository.listByUser(userId);
      assert.equal(historical.length, 1);
      assert.ok(historical[0]?.revokedAt instanceof Date);
    } finally {
      await pool.query("DELETE FROM api_keys WHERE id = $1", [keyId]).catch(() => undefined);
      await pool.query("DELETE FROM users WHERE id = $1", [userId]).catch(() => undefined);
      await pool.end();
    }
  },
);
