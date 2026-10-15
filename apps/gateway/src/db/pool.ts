import { Pool } from "pg";

export interface DatabaseConfig {
  connectionString: string;
  max?: number;
  connectionTimeoutMillis?: number;
}

export function createDatabasePool(config: DatabaseConfig): Pool {
  return new Pool({
    connectionString: config.connectionString,
    max: config.max ?? 10,
    connectionTimeoutMillis: config.connectionTimeoutMillis ?? 5000,
    application_name: "urumi-gateway",
  });
}

export function createDatabasePoolFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Pool | null {
  const connectionString = env.DATABASE_URL?.trim();

  if (!connectionString) {
    return null;
  }

  return createDatabasePool({ connectionString });
}
