import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { generateApiKey } from "../auth/api-key.js";
import type { UserRecord } from "./user-repository.js";

export interface ProvisionedTeamMember {
  user: UserRecord;
  apiKey: {
    id: string;
    name: string;
    key: string;
    createdAt: Date;
  };
}

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  role: "admin" | "member";
  created_at: Date;
  updated_at: Date;
}

interface ApiKeyRow {
  id: string;
  name: string;
  created_at: Date;
}

export async function provisionTeamMember(
  pool: Pool,
  input: {
    email: string;
    displayName: string;
    keyName?: string;
  },
): Promise<ProvisionedTeamMember> {
  const email = input.email.trim().toLowerCase();
  const displayName = input.displayName.trim();
  const keyName = input.keyName?.trim() || "Team member key";
  const userId = randomUUID();
  const keyId = randomUUID();
  const generated = generateApiKey();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const userResult = await client.query<UserRow>(
      `INSERT INTO users (id, email, display_name, role)
       VALUES ($1, $2, $3, 'member')
       RETURNING id, email, display_name, role, created_at, updated_at`,
      [userId, email, displayName],
    );

    const userRow = userResult.rows[0];
    if (!userRow) {
      throw new Error("Creating the team member returned no row.");
    }

    const keyResult = await client.query<ApiKeyRow>(
      `INSERT INTO api_keys (id, user_id, name, key_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, created_at`,
      [keyId, userId, keyName, generated.hash],
    );

    const keyRow = keyResult.rows[0];
    if (!keyRow) {
      throw new Error("Creating the team member API key returned no row.");
    }

    await client.query("COMMIT");

    return {
      user: {
        id: userRow.id,
        email: userRow.email,
        displayName: userRow.display_name,
        role: userRow.role,
        createdAt: userRow.created_at,
        updatedAt: userRow.updated_at,
      },
      apiKey: {
        id: keyRow.id,
        name: keyRow.name,
        key: generated.key,
        createdAt: keyRow.created_at,
      },
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
