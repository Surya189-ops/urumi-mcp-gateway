import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "./app.js";
import { generateApiKey, hashApiKey } from "./auth/api-key.js";
import type {
  ApiKeyRecord,
  ApiKeyRepository,
} from "./db/api-key-repository.js";

const userId = "11111111-1111-4111-8111-111111111111";
const keyId = "22222222-2222-4222-8222-222222222222";
const otherKeyId = "33333333-3333-4333-8333-333333333333";

function makeRecord(overrides: Partial<ApiKeyRecord> = {}): ApiKeyRecord {
  return {
    id: keyId,
    userId,
    name: "Existing key",
    keyHash: hashApiKey("urumi_" + "a".repeat(43)),
    revokedAt: null,
    lastUsedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function makeHarness() {
  const generated = generateApiKey();
  const existing = makeRecord();
  const created: Array<{
    id: string;
    userId: string;
    name: string;
    keyHash: string;
  }> = [];
  const revocations: Array<{ id: string; userId: string }> = [];

  const repository: ApiKeyRepository = {
    async create(input) {
      created.push(input);
      return makeRecord({
        id: input.id,
        userId: input.userId,
        name: input.name,
        keyHash: input.keyHash,
      });
    },
    async findActiveByHash(hash) {
      return hash === generated.hash
        ? makeRecord({
            id: "44444444-4444-4444-8444-444444444444",
            keyHash: generated.hash,
          })
        : undefined;
    },
    async findUserRole() {
      return "member";
    },
    async listByUser(requestedUserId) {
      return requestedUserId === userId ? [existing] : [];
    },
    async markUsed() {},
    async revoke(id, requestedUserId) {
      revocations.push({ id, userId: requestedUserId });
      return id === keyId && requestedUserId === userId;
    },
  };

  const app = buildApp({
    apiKeyRepository: repository,
    authRequired: true,
  });

  return { app, generated, created, revocations };
}

test("POST /api-keys stores a hash and returns the raw key once", async () => {
  const harness = makeHarness();

  try {
    const response = await harness.app.inject({
      method: "POST",
      url: "/api-keys",
      headers: { authorization: `Bearer ${harness.generated.key}` },
      payload: { name: "Automation key" },
    });

    assert.equal(response.statusCode, 201);
    const body = response.json();
    assert.equal(body.key.startsWith("urumi_"), true);
    assert.equal(body.name, "Automation key");
    assert.equal(body.message, "Save this key now. It will not be shown again.");
    assert.equal(harness.created.length, 1);
    assert.equal(harness.created[0]?.userId, userId);
    assert.equal(harness.created[0]?.name, "Automation key");
    assert.equal(harness.created[0]?.keyHash, hashApiKey(body.key));
    assert.equal("keyHash" in body, false);
  } finally {
    await harness.app.close();
  }
});

test("POST /api-keys rejects invalid names", async () => {
  const harness = makeHarness();

  try {
    const response = await harness.app.inject({
      method: "POST",
      url: "/api-keys",
      headers: { authorization: `Bearer ${harness.generated.key}` },
      payload: { name: "   " },
    });

    assert.equal(response.statusCode, 400);
    assert.equal(harness.created.length, 0);
  } finally {
    await harness.app.close();
  }
});

test("GET /api-keys lists only safe metadata without hashes", async () => {
  const harness = makeHarness();

  try {
    const response = await harness.app.inject({
      method: "GET",
      url: "/api-keys",
      headers: { authorization: `Bearer ${harness.generated.key}` },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), [{
      id: keyId,
      name: "Existing key",
      createdAt: "2026-01-01T00:00:00.000Z",
      lastUsedAt: null,
      revokedAt: null,
      active: true,
    }]);
    assert.equal(response.body.includes("keyHash"), false);
    assert.equal(response.body.includes("urumi_"), false);
  } finally {
    await harness.app.close();
  }
});

test("DELETE /api-keys/:id revokes using the authenticated user's ID", async () => {
  const harness = makeHarness();

  try {
    const response = await harness.app.inject({
      method: "DELETE",
      url: `/api-keys/${keyId}`,
      headers: { authorization: `Bearer ${harness.generated.key}` },
    });

    assert.equal(response.statusCode, 204);
    assert.deepEqual(harness.revocations, [{ id: keyId, userId }]);
  } finally {
    await harness.app.close();
  }
});

test("DELETE /api-keys/:id does not reveal or revoke another user's key", async () => {
  const harness = makeHarness();

  try {
    const response = await harness.app.inject({
      method: "DELETE",
      url: `/api-keys/${otherKeyId}`,
      headers: { authorization: `Bearer ${harness.generated.key}` },
    });

    assert.equal(response.statusCode, 404);
    assert.deepEqual(harness.revocations, [{
      id: otherKeyId,
      userId,
    }]);
  } finally {
    await harness.app.close();
  }
});

test("API-key routes reject requests without authentication", async () => {
  const harness = makeHarness();

  try {
    const responses = await Promise.all([
      harness.app.inject({ method: "GET", url: "/api-keys" }),
      harness.app.inject({
        method: "POST",
        url: "/api-keys",
        payload: { name: "Should fail" },
      }),
      harness.app.inject({
        method: "DELETE",
        url: `/api-keys/${keyId}`,
      }),
    ]);

    assert.deepEqual(responses.map((response) => response.statusCode), [
      401, 401, 401,
    ]);
    assert.equal(harness.created.length, 0);
    assert.equal(harness.revocations.length, 0);
  } finally {
    await harness.app.close();
  }
});

test("DELETE /api-keys/:id rejects malformed IDs", async () => {
  const harness = makeHarness();

  try {
    const response = await harness.app.inject({
      method: "DELETE",
      url: "/api-keys/not-a-uuid",
      headers: { authorization: `Bearer ${harness.generated.key}` },
    });

    assert.equal(response.statusCode, 400);
    assert.equal(harness.revocations.length, 0);
  } finally {
    await harness.app.close();
  }
});
