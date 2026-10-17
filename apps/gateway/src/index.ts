import { buildApp } from "./app.js";
import { createDatabasePoolFromEnv } from "./db/pool.js";
import { runMigrations } from "./db/migrate.js";
import { PostgresUpstreamRepository } from "./db/postgres-upstream-repository.js";
import { PostgresApiKeyRepository } from "./db/postgres-api-key-repository.js";
import { restoreUpstreams } from "./upstreams/restore.js";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

const pool = createDatabasePoolFromEnv();

if (!pool) {
  throw new Error("DATABASE_URL is required to start the gateway with API-key authentication.");
}

let app: ReturnType<typeof buildApp> | undefined;

try {
  await runMigrations(pool);
  const repository = new PostgresUpstreamRepository(pool);
  const apiKeyRepository = new PostgresApiKeyRepository(pool);
  await restoreUpstreams({ repository });
  app = buildApp({
    upstreamRepository: repository,
    apiKeyRepository,
    authRequired: true,
  });

  await app.listen({ port, host });
} catch (error) {
  app?.log.error(error);
  await pool?.end().catch(() => undefined);
  process.exit(1);
}

async function shutdown(signal: string): Promise<void> {
  app?.log.info({ signal }, "Shutting down gateway");
  try {
    await app?.close();
    await pool?.end();
    process.exit(0);
  } catch (error) {
    app?.log.error(error);
    process.exit(1);
  }
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
