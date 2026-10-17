import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import { hashApiKey, hasValidApiKeyFormat } from "../auth/api-key.js";
import { provisionTeamMember } from "./provision-team-member.js";

function makePool(failOnKeyInsert = false) {
  const queries: Array<{ sql: string; values?: unknown[] }> = [];
  let released = false;

  const client = {
    async query(sql: string, values?: unknown[]) {
      queries.push({ sql, values });

      if (sql.includes("INSERT INTO users")) {
        return {
          rows: [{
            id: values?.[0],
            email: values?.[1],
            display_name: values?.[2],
            role: "member",
            created_at: new Date("2026-10-17T00:00:00Z"),
            updated_at: new Date("2026-10-17T00:00:00Z"),
          }],
        };
      }

      if (sql.includes("INSERT INTO api_keys")) {
        if (failOnKeyInsert) {
          throw new Error("simulated API-key insert failure");
        }

        return {
          rows: [{
            id: values?.[0],
            name: values?.[2],
            created_at: new Date("2026-10-17T00:00:00Z"),
          }],
        };
      }

      return { rows: [] };
    },
    release() {
      released = true;
    },
  };

  const pool = {
    async connect() {
      return client;
    },
  } as unknown as Pool;

  return {
    pool,
    queries,
    wasReleased: () => released,
  };
}

test("provisions a member and API key in one transaction", async () => {
  const h = makePool();

  const result = await provisionTeamMember(h.pool, {
    email: " MEMBER@EXAMPLE.COM ",
    displayName: " Team Member ",
  });

  assert.equal(result.user.email, "member@example.com");
  assert.equal(result.user.displayName, "Team Member");
  assert.equal(result.user.role, "member");
  assert.equal(result.apiKey.name, "Team member key");
  assert.equal(hasValidApiKeyFormat(result.apiKey.key), true);

  const keyInsert = h.queries.find((query) =>
    query.sql.includes("INSERT INTO api_keys"),
  );
  assert.ok(keyInsert);
  assert.equal(keyInsert.values?.[3], hashApiKey(result.apiKey.key));

  assert.deepEqual(
    h.queries.filter((query) =>
      ["BEGIN", "COMMIT", "ROLLBACK"].includes(query.sql),
    ).map((query) => query.sql),
    ["BEGIN", "COMMIT"],
  );
  assert.equal(h.wasReleased(), true);
});

test("rolls back user creation when API-key insertion fails", async () => {
  const h = makePool(true);

  await assert.rejects(
    provisionTeamMember(h.pool, {
      email: "member@example.com",
      displayName: "Team Member",
    }),
    /simulated API-key insert failure/,
  );

  assert.deepEqual(
    h.queries.filter((query) =>
      ["BEGIN", "COMMIT", "ROLLBACK"].includes(query.sql),
    ).map((query) => query.sql),
    ["BEGIN", "ROLLBACK"],
  );
  assert.equal(h.wasReleased(), true);
});
