import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { hashApiKey, hasValidApiKeyFormat } from "../auth/api-key.js";
import { provisionTeamMember } from "./provision-team-member.js";

const databaseUrl = process.env.DATABASE_URL;

test(
  "persists a team member and its hashed API key atomically in PostgreSQL",
  { skip: !databaseUrl ? "DATABASE_URL is not configured" : false },
  async () => {
    const pool = new pg.Pool({ connectionString: databaseUrl });
    let userId: string | undefined;
    let keyId: string | undefined;

    try {
      const result = await provisionTeamMember(pool, {
        email: `  ${randomUUID()}@integration.test  `,
        displayName: "  Integration Member  ",
      });

      userId = result.user.id;
      keyId = result.apiKey.id;

      assert.equal(result.user.email, result.user.email.trim().toLowerCase());
      assert.match(result.user.email, /@integration\.test$/);
      assert.equal(result.user.displayName, "Integration Member");
      assert.equal(result.user.role, "member");
      assert.equal(result.apiKey.name, "Team member key");
      assert.equal(hasValidApiKeyFormat(result.apiKey.key), true);

      const persisted = await pool.query(
        `SELECT u.id AS user_id, u.email, u.display_name, u.role,
                k.id AS key_id, k.name AS key_name, k.key_hash
         FROM users u
         JOIN api_keys k ON k.user_id = u.id
         WHERE u.id = $1 AND k.id = $2`,
        [userId, keyId],
      );

      assert.equal(persisted.rowCount, 1);
      assert.equal(persisted.rows[0]?.email, result.user.email);
      assert.equal(persisted.rows[0]?.display_name, "Integration Member");
      assert.equal(persisted.rows[0]?.role, "member");
      assert.equal(persisted.rows[0]?.key_name, "Team member key");
      assert.equal(persisted.rows[0]?.key_hash, hashApiKey(result.apiKey.key));
      assert.notEqual(persisted.rows[0]?.key_hash, result.apiKey.key);
    } finally {
      if (keyId) {
        await pool.query("DELETE FROM api_keys WHERE id = $1", [keyId])
          .catch(() => undefined);
      }
      if (userId) {
        await pool.query("DELETE FROM users WHERE id = $1", [userId])
          .catch(() => undefined);
      }
      await pool.end();
    }
  },
);
