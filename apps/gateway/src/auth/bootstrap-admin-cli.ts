import { createDatabasePoolFromEnv } from "../db/pool.js";
import { bootstrapInitialAdmin } from "./bootstrap-admin.js";

const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim();
const displayName = process.env.BOOTSTRAP_ADMIN_NAME?.trim();
const keyName = process.env.BOOTSTRAP_ADMIN_KEY_NAME?.trim();

if (!process.env.DATABASE_URL?.trim() || !email || !displayName) {
  console.error(
    "Required environment variables: DATABASE_URL, BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_NAME",
  );
  process.exitCode = 1;
} else {
  const pool = createDatabasePoolFromEnv();

  if (!pool) {
    console.error("DATABASE_URL is required.");
    process.exitCode = 1;
  } else {
    try {
      const result = await bootstrapInitialAdmin(pool, {
        email,
        displayName,
        ...(keyName ? { keyName } : {}),
      });

      console.log("Initial admin created successfully.");
      console.log(`Email: ${result.email}`);
      console.log(`User ID: ${result.userId}`);
      console.log(`API key ID: ${result.apiKeyId}`);
      console.log("Save this API key now; it cannot be retrieved later:");
      console.log(result.apiKey);
    } catch (error) {
      console.error(
        "Admin bootstrap failed:",
        error instanceof Error ? error.message : "Unknown error",
      );
      process.exitCode = 1;
    } finally {
      await pool.end();
    }
  }
}
