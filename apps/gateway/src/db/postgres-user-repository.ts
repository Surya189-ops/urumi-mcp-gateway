import type { Pool } from "pg";
import type { UserRecord, UserRepository, UserRole } from "./user-repository.js";

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  role: UserRole;
  created_at: Date;
  updated_at: Date;
}

const FIELDS = "id, email, display_name, role, created_at, updated_at";

function toRecord(row: UserRow): UserRecord {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class PostgresUserRepository implements UserRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: {
    id: string;
    email: string;
    displayName: string;
    role?: UserRole;
  }): Promise<UserRecord> {
    const result = await this.pool.query<UserRow>(
      `INSERT INTO users (id, email, display_name, role)
       VALUES ($1, $2, $3, $4) RETURNING ${FIELDS}`,
      [input.id, input.email.trim().toLowerCase(),
       input.displayName.trim(), input.role ?? "member"],
    );
    const row = result.rows[0];
    if (!row) throw new Error("Creating the user returned no row.");
    return toRecord(row);
  }

  async findById(id: string): Promise<UserRecord | undefined> {
    const result = await this.pool.query<UserRow>(
      `SELECT ${FIELDS} FROM users WHERE id = $1`, [id],
    );
    return result.rows[0] ? toRecord(result.rows[0]) : undefined;
  }

  async list(): Promise<UserRecord[]> {
    const result = await this.pool.query<UserRow>(
      `SELECT ${FIELDS} FROM users ORDER BY created_at ASC, id ASC`,
    );
    return result.rows.map(toRecord);
  }

  async updateRole(
    id: string,
    role: UserRole,
  ): Promise<UserRecord | undefined> {
    const result = await this.pool.query<UserRow>(
      `UPDATE users SET role = $2, updated_at = NOW()
       WHERE id = $1 RETURNING ${FIELDS}`,
      [id, role],
    );
    return result.rows[0] ? toRecord(result.rows[0]) : undefined;
  }
}
