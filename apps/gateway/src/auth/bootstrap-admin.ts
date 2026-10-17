import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { generateApiKey } from "./api-key.js";

export interface BootstrapAdminInput {
  email: string;
  displayName: string;
  keyName?: string;
}

export interface BootstrapAdminResult {
  userId: string;
  email: string;
  apiKeyId: string;
  apiKey: string;
}

export async function bootstrapInitialAdmin(
  pool: Pool,
  input: BootstrapAdminInput,
): Promise<BootstrapAdminResult> {
  const email = input.email.trim().toLowerCase();
  const displayName = input.displayName.trim();
  const keyName = input.keyName?.trim() || "Initial admin key";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("A valid admin email is required.");
  }

  if (!displayName) {
    throw new Error("Admin display name is required.");
  }

  const client = await pool.connect();
  const userId = randomUUID();
  const apiKeyId = randomUUID();
  const generated = generateApiKey();

  try {
    await client.query("BEGIN");

    // Serialize bootstrap attempts across processes and sessions.
    await client.query("SELECT pg_advisory_xact_lock($1, $2)", [
      1179796813,
      1,
    ]);

    const existing = await client.query<{ id: string }>(
      "SELECT id FROM users LIMIT 1",
    );

    if (existing.rows.length > 0) {
      throw new Error(
        "Admin bootstrap refused: users already exist. Use the normal account-management workflow instead.",
      );
    }

    await client.query(
      `INSERT INTO users (id, email, display_name, role)
       VALUES ($1, $2, $3, 'admin')`,
      [userId, email, displayName],
    );

    await client.query(
      `INSERT INTO api_keys (id, user_id, name, key_hash)
       VALUES ($1, $2, $3, $4)`,
      [apiKeyId, userId, keyName, generated.hash],
    );

    await client.query("COMMIT");

    return {
      userId,
      email,
      apiKeyId,
      apiKey: generated.key,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
