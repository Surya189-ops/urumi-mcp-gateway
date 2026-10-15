import { buildApp } from "./app.js";
import { createDatabasePoolFromEnv } from "./db/pool.js";
import { runMigrations } from "./db/migrate.js";
import { PostgresUpstreamRepository } from "./db/postgres-upstream-repository.js";
import { restoreUpstreams } from "./upstreams/restore.js";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";
const isProduction = process.env.NODE_ENV === "production";

const pool = createDatabasePoolFromEnv();

if (isProduction && !pool) {
  throw new Error("DATABASE_URL is required in production.");
}

let app: ReturnType<typeof buildApp> | undefined;

try {
  if (pool) {
    await runMigrations(pool);
    const repository = new PostgresUpstreamRepository(pool);
    await restoreUpstreams({ repository });
    app = buildApp(repository);
  } else {
    app = buildApp();
    app.log.warn(
      "DATABASE_URL is not set; starting without persistent upstream storage.",
    );
  }

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
