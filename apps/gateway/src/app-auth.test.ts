import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "./app.js";
import { generateApiKey } from "./auth/api-key.js";
import type { ApiKeyRecord, ApiKeyRepository } from "./db/api-key-repository.js";

function makeRepository(role: "admin" | "member" = "member"): ApiKeyRepository {
  const generated = generateApiKey();
  const record: ApiKeyRecord = {
    id: "test-key-id",
    userId: "test-user-id",
    name: "HTTP test key",
    keyHash: generated.hash,
    revokedAt: null,
    lastUsedAt: null,
    createdAt: new Date(),
  };

  return {
    create: async () => record,
    findActiveByHash: async (hash) => hash === record.keyHash ? record : undefined,
    findUserRole: async () => role,
    listByUser: async () => [record],
    markUsed: async () => undefined,
    revoke: async () => true,
  };
}

test("protected routes reject requests without a bearer key", async () => {
  const app = buildApp({
    apiKeyRepository: makeRepository(),
    authRequired: true,
  });

  try {
    const adminResponse = await app.inject({
      method: "GET",
      url: "/admin/upstreams",
    });
    const mcpResponse = await app.inject({
      method: "POST",
      url: "/mcp",
      payload: { jsonrpc: "2.0", id: 1, method: "tools/list" },
    });

    assert.equal(adminResponse.statusCode, 401);
    assert.equal(mcpResponse.statusCode, 401);
  } finally {
    await app.close();
  }
});

test("protected routes reject an invalid bearer key", async () => {
  const app = buildApp({
    apiKeyRepository: makeRepository(),
    authRequired: true,
  });

  try {
    const response = await app.inject({
      method: "GET",
      url: "/admin/upstreams",
      headers: { authorization: "Bearer urumi_invalid" },
    });

    assert.equal(response.statusCode, 401);
  } finally {
    await app.close();
  }
});

test("member keys cannot access admin-only upstream routes", async () => {
  const generated = generateApiKey();
  const repository = makeRepository("member");
  const app = buildApp({
    apiKeyRepository: {
      ...repository,
      findActiveByHash: async () => ({
        id: "test-key-id",
        userId: "test-user-id",
        name: "Member key",
        keyHash: generated.hash,
        revokedAt: null,
        lastUsedAt: null,
        createdAt: new Date(),
      }),
    },
    authRequired: true,
  });

  try {
    const response = await app.inject({
      method: "GET",
      url: "/admin/upstreams",
      headers: { authorization: `Bearer ${generated.key}` },
    });

    assert.equal(response.statusCode, 403);
    assert.equal(response.json().error, "Administrator role required");
  } finally {
    await app.close();
  }
});

test("admin keys can access admin-only upstream routes", async () => {
  const generated = generateApiKey();
  const repository = makeRepository("admin");
  const app = buildApp({
    apiKeyRepository: {
      ...repository,
      findActiveByHash: async () => ({
        id: "test-key-id",
        userId: "test-user-id",
        name: "Admin key",
        keyHash: generated.hash,
        revokedAt: null,
        lastUsedAt: null,
        createdAt: new Date(),
      }),
    },
    authRequired: true,
  });

  try {
    const response = await app.inject({
      method: "GET",
      url: "/admin/upstreams",
      headers: { authorization: `Bearer ${generated.key}` },
    });

    assert.equal(response.statusCode, 200);
  } finally {
    await app.close();
  }
});

test("health endpoint remains public when authentication is required", async () => {
  const app = buildApp({
    apiKeyRepository: makeRepository(),
    authRequired: true,
  });

  try {
    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.json().status, "ok");
  } finally {
    await app.close();
  }
});

test("GET /me returns the authenticated identity without exposing the API key", async () => {
  const generated = generateApiKey();
  const repository = makeRepository("admin");
  const app = buildApp({
    apiKeyRepository: {
      ...repository,
      findActiveByHash: async () => ({
        id: "test-key-id",
        userId: "test-user-id",
        name: "Admin key",
        keyHash: generated.hash,
        revokedAt: null,
        lastUsedAt: null,
        createdAt: new Date(),
      }),
    },
    authRequired: true,
  });

  try {
    const response = await app.inject({
      method: "GET",
      url: "/me",
      headers: { authorization: `Bearer ${generated.key}` },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      userId: "test-user-id",
      apiKeyId: "test-key-id",
      role: "admin",
    });
    assert.equal(JSON.stringify(response.json()).includes(generated.key), false);
  } finally {
    await app.close();
  }
});

test("GET /me rejects missing credentials", async () => {
  const app = buildApp({
    apiKeyRepository: makeRepository(),
    authRequired: true,
  });

  try {
    const response = await app.inject({ method: "GET", url: "/me" });
    assert.equal(response.statusCode, 401);
  } finally {
    await app.close();
  }
});
