import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "./app.js";
import { generateApiKey } from "./auth/api-key.js";
import type { ApiKeyRepository } from "./db/api-key-repository.js";
import type { AuditLogRecord, AuditRepository } from "./db/audit-repository.js";

const userId = "11111111-1111-4111-8111-111111111111";
const timestamp = new Date("2026-10-17T03:00:00Z");

const record: AuditLogRecord = {
  id: "1",
  userId,
  upstreamId: "woo-store",
  toolName: "list_orders",
  outcome: "success",
  durationMs: 42,
  errorMessage: null,
  createdAt: timestamp,
};

function harness(role: "admin" | "member" = "admin") {
  const generated = generateApiKey();
  const received: Array<Parameters<AuditRepository["list"]>[0]> = [];

  const apiKeyRepository: ApiKeyRepository = {
    create: async () => { throw new Error("Not used"); },
    findActiveByHash: async (hash) => hash === generated.hash
      ? {
          id: "33333333-3333-4333-8333-333333333333",
          userId,
          name: "route test key",
          keyHash: generated.hash,
          revokedAt: null,
          lastUsedAt: null,
          createdAt: timestamp,
        }
      : undefined,
    findUserRole: async () => role,
    listByUser: async () => [],
    markUsed: async () => undefined,
    revoke: async () => false,
  };

  const auditRepository: AuditRepository = {
    create: async () => record,
    list: async (options) => {
      received.push(options);
      return [record];
    },
  };

  const app = buildApp({
    apiKeyRepository,
    auditRepository,
    authRequired: true,
  });

  return { app, key: generated.key, received };
}

test("admin can list audit logs with validated filters", async () => {
  const h = harness();

  try {
    const response = await h.app.inject({
      method: "GET",
      url: `/admin/audit-logs?limit=25&userId=${userId}&upstreamId=woo-store&outcome=error&from=2026-10-17T00%3A00%3A00Z&to=2026-10-18T00%3A00%3A00Z`,
      headers: { authorization: `Bearer ${h.key}` },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json()[0].toolName, "list_orders");
    assert.deepEqual(h.received[0], {
      limit: 25,
      userId,
      upstreamId: "woo-store",
      outcome: "error",
      from: new Date("2026-10-17T00:00:00Z"),
      to: new Date("2026-10-18T00:00:00Z"),
    });
  } finally {
    await h.app.close();
  }
});

test("audit log endpoint rejects member keys", async () => {
  const h = harness("member");

  try {
    const response = await h.app.inject({
      method: "GET",
      url: "/admin/audit-logs",
      headers: { authorization: `Bearer ${h.key}` },
    });

    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error, "Administrator role required");
    assert.equal(h.received.length, 0);
  } finally {
    await h.app.close();
  }
});

test("audit log endpoint rejects missing authentication", async () => {
  const h = harness();

  try {
    const response = await h.app.inject({
      method: "GET",
      url: "/admin/audit-logs",
    });

    assert.equal(response.statusCode, 401);
    assert.equal(h.received.length, 0);
  } finally {
    await h.app.close();
  }
});

test("audit log endpoint rejects invalid filters", async () => {
  const h = harness();

  try {
    for (const query of [
      "?limit=501",
      "?outcome=unknown",
      "?userId=not-a-uuid",
      "?from=not-a-date",
      "?from=2026-10-18T00%3A00%3A00Z&to=2026-10-17T00%3A00%3A00Z",
    ]) {
      const response = await h.app.inject({
        method: "GET",
        url: `/admin/audit-logs${query}`,
        headers: { authorization: `Bearer ${h.key}` },
      });

      assert.equal(response.statusCode, 400, query);
    }

    assert.equal(h.received.length, 0);
  } finally {
    await h.app.close();
  }
});
