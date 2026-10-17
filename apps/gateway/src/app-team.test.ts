import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "./app.js";
import { generateApiKey, hasValidApiKeyFormat } from "./auth/api-key.js";
import type { ApiKeyRepository } from "./db/api-key-repository.js";
import type { UserRecord, UserRepository } from "./db/user-repository.js";

const userId = "11111111-1111-4111-8111-111111111111";
const memberId = "22222222-2222-4222-8222-222222222222";

function makeUser(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: memberId,
    email: "member@example.com",
    displayName: "Team Member",
    role: "member",
    createdAt: new Date("2026-10-15T12:00:00Z"),
    updatedAt: new Date("2026-10-15T12:00:00Z"),
    ...overrides,
  };
}

function harness(
  role: "admin" | "member" = "admin",
  duplicateEmail = false,
) {
  const key = generateApiKey();
  const created: Array<{
    id: string;
    email: string;
    displayName: string;
    role?: "admin" | "member";
  }> = [];
  const updated: Array<{ id: string; role: "admin" | "member" }> = [];
  const provisionedKeys: string[] = [];

  const apiKeys: ApiKeyRepository = {
    async create() { throw new Error("Not used"); },
    async findActiveByHash(hash) {
      return hash === key.hash
        ? {
            id: "33333333-3333-4333-8333-333333333333",
            userId,
            name: "test",
            keyHash: key.hash,
            revokedAt: null,
            lastUsedAt: null,
            createdAt: new Date(),
          }
        : undefined;
    },
    async findUserRole() { return role; },
    async listByUser() { return []; },
    async markUsed() {},
    async revoke() { return false; },
  };

  const users: UserRepository = {
    async create(input) {
      created.push(input);
      if (duplicateEmail) {
        throw Object.assign(new Error("duplicate email"), { code: "23505" });
      }
      return makeUser({
        id: input.id,
        email: input.email.trim().toLowerCase(),
        displayName: input.displayName.trim(),
        role: input.role ?? "member",
      });
    },
    async findById(id) {
      return id === memberId ? makeUser() : undefined;
    },
    async list() { return [makeUser()]; },
    async updateRole(id, newRole) {
      updated.push({ id, role: newRole });
      return id === memberId ? makeUser({ role: newRole }) : undefined;
    },
  };

  const app = buildApp({
    apiKeyRepository: apiKeys,
    userRepository: users,
    provisionTeamMember: async (input) => {
      created.push({
        id: memberId,
        email: input.email,
        displayName: input.displayName,
        role: "member",
      });
      if (duplicateEmail) {
        throw Object.assign(new Error("duplicate email"), { code: "23505" });
      }
      const generated = generateApiKey();
      provisionedKeys.push(generated.key);
      const user = makeUser({
        email: input.email.trim().toLowerCase(),
        displayName: input.displayName.trim(),
      });
      return {
        user,
        apiKey: {
          id: "44444444-4444-4444-8444-444444444444",
          name: input.keyName ?? "Team member key",
          key: generated.key,
          createdAt: new Date("2026-10-15T12:00:00Z"),
        },
      };
    },
    authRequired: true,
  });

  return { app, key, created, updated, provisionedKeys };
}

test("GET /admin/users lists members for admins", async () => {
  const h = harness();
  try {
    const response = await h.app.inject({
      method: "GET",
      url: "/admin/users",
      headers: { authorization: `Bearer ${h.key.key}` },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json()[0].email, "member@example.com");
  } finally {
    await h.app.close();
  }
});

test("POST /admin/users creates a member by default", async () => {
  const h = harness();
  try {
    const response = await h.app.inject({
      method: "POST",
      url: "/admin/users",
      headers: { authorization: `Bearer ${h.key.key}` },
      payload: { email: "NEW@example.com", displayName: " New Member " },
    });
    assert.equal(response.statusCode, 201);
    assert.equal(response.json().user.role, "member");
    assert.equal(response.json().user.email, "new@example.com");
    assert.equal(h.created[0]?.role, "member");
    assert.equal(hasValidApiKeyFormat(response.json().apiKey.key), true);
    assert.equal(response.json().apiKey.name, "Team member key");
    assert.match(response.json().message, /will not be shown again/);
    assert.equal(h.provisionedKeys[0], response.json().apiKey.key);
  } finally {
    await h.app.close();
  }
});

test("POST /admin/users rejects invalid input", async () => {
  const h = harness();
  try {
    const response = await h.app.inject({
      method: "POST",
      url: "/admin/users",
      headers: { authorization: `Bearer ${h.key.key}` },
      payload: { email: "not-an-email", displayName: " " },
    });
    assert.equal(response.statusCode, 400);
    assert.equal(h.created.length, 0);
  } finally {
    await h.app.close();
  }
});

test("POST /admin/users maps a database duplicate-email error to 409", async () => {
  const h = harness("admin", true);
  try {
    const response = await h.app.inject({
      method: "POST",
      url: "/admin/users",
      headers: { authorization: `Bearer ${h.key.key}` },
      payload: { email: "member@example.com", displayName: "Duplicate" },
    });
    assert.equal(response.statusCode, 409);
    assert.deepEqual(response.json(), {
      error: "A user with this email already exists",
    });
  } finally {
    await h.app.close();
  }
});

test("PATCH /admin/users/:id/role updates a valid role", async () => {
  const h = harness();
  try {
    const response = await h.app.inject({
      method: "PATCH",
      url: `/admin/users/${memberId}/role`,
      headers: { authorization: `Bearer ${h.key.key}` },
      payload: { role: "admin" },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().role, "admin");
    assert.deepEqual(h.updated, [{ id: memberId, role: "admin" }]);
  } finally {
    await h.app.close();
  }
});

test("team routes reject unauthenticated requests", async () => {
  const h = harness();
  try {
    const responses = await Promise.all([
      h.app.inject({ method: "GET", url: "/admin/users" }),
      h.app.inject({
        method: "POST",
        url: "/admin/users",
        payload: { email: "new@example.com", displayName: "New" },
      }),
      h.app.inject({
        method: "PATCH",
        url: `/admin/users/${memberId}/role`,
        payload: { role: "admin" },
      }),
    ]);
    assert.deepEqual(responses.map((r) => r.statusCode), [401, 401, 401]);
  } finally {
    await h.app.close();
  }
});

test("team routes reject authenticated non-admin members", async () => {
  const h = harness("member");
  try {
    const responses = await Promise.all([
      h.app.inject({
        method: "GET",
        url: "/admin/users",
        headers: { authorization: `Bearer ${h.key.key}` },
      }),
      h.app.inject({
        method: "POST",
        url: "/admin/users",
        headers: { authorization: `Bearer ${h.key.key}` },
        payload: { email: "new@example.com", displayName: "New" },
      }),
      h.app.inject({
        method: "PATCH",
        url: `/admin/users/${memberId}/role`,
        headers: { authorization: `Bearer ${h.key.key}` },
        payload: { role: "admin" },
      }),
    ]);
    assert.deepEqual(responses.map((r) => r.statusCode), [403, 403, 403]);
    assert.equal(h.created.length, 0);
    assert.equal(h.updated.length, 0);
  } finally {
    await h.app.close();
  }
});
