import type { Pool } from "pg";
import type {
  ApiKeyRecord,
  ApiKeyRepository,
} from "./api-key-repository.js";

interface ApiKeyRow {
  id: string;
  user_id: string;
  name: string;
  key_hash: string;
  revoked_at: Date | null;
  last_used_at: Date | null;
  created_at: Date;
}

const SELECT_FIELDS =
  "id, user_id, name, key_hash, revoked_at, last_used_at, created_at";

function toRecord(row: ApiKeyRow): ApiKeyRecord {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    keyHash: row.key_hash,
    revokedAt: row.revoked_at,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
  };
}

export class PostgresApiKeyRepository implements ApiKeyRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: {
    id: string;
    userId: string;
    name: string;
    keyHash: string;
  }): Promise<ApiKeyRecord> {
    const result = await this.pool.query<ApiKeyRow>(
      `INSERT INTO api_keys (id, user_id, name, key_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING ${SELECT_FIELDS}`,
      [input.id, input.userId, input.name, input.keyHash],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error("Creating the API key returned no row.");
    }

    return toRecord(row);
  }

  async findActiveByHash(
    keyHash: string,
  ): Promise<ApiKeyRecord | undefined> {
    const result = await this.pool.query<ApiKeyRow>(
      `SELECT ${SELECT_FIELDS}
       FROM api_keys
       WHERE key_hash = $1 AND revoked_at IS NULL`,
      [keyHash],
    );

    const row = result.rows[0];
    return row ? toRecord(row) : undefined;
  }

  async findUserRole(userId: string): Promise<"admin" | "member" | undefined> {
    const result = await this.pool.query<{ role: "admin" | "member" }>(
      "SELECT role FROM users WHERE id = $1",
      [userId],
    );

    return result.rows[0]?.role;
  }

  async listByUser(userId: string): Promise<ApiKeyRecord[]> {
    const result = await this.pool.query<ApiKeyRow>(
      `SELECT ${SELECT_FIELDS}
       FROM api_keys
       WHERE user_id = $1
       ORDER BY created_at DESC, id`,
      [userId],
    );

    return result.rows.map(toRecord);
  }

  async markUsed(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE api_keys
       SET last_used_at = NOW()
       WHERE id = $1 AND revoked_at IS NULL`,
      [id],
    );
  }

  async revoke(id: string, userId: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE api_keys
       SET revoked_at = NOW()
       WHERE id = $1
         AND user_id = $2
         AND revoked_at IS NULL`,
      [id, userId],
    );

    return result.rowCount !== null && result.rowCount > 0;
  }
}
