import assert from "node:assert/strict";
import test from "node:test";
import type {
  ApiKeyRecord,
  ApiKeyRepository,
} from "../db/api-key-repository.js";
import { generateApiKey } from "./api-key.js";
import { authenticateApiKey } from "./authenticate-api-key.js";

function makeRecord(
  keyHash: string,
  overrides: Partial<ApiKeyRecord> = {},
): ApiKeyRecord {
  return {
    id: "key-1",
    userId: "user-1",
    name: "Test key",
    keyHash,
    revokedAt: null,
    lastUsedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function makeRepository(
  record?: ApiKeyRecord,
): ApiKeyRepository & { markedUsed: string[] } {
  const repository = {
    markedUsed: [] as string[],
    async create() {
      throw new Error("Not implemented");
    },
    async findActiveByHash(hash: string) {
      return record?.keyHash === hash ? record : undefined;
    },
    async listByUser() {
      return record ? [record] : [];
    },
    async findUserRole() {
      return "member" as const;
    },
    async markUsed(id: string) {
      repository.markedUsed.push(id);
    },
    async revoke() {
      return false;
    },
  };

  return repository;
}

test("rejects a missing bearer token", async () => {
  const result = await authenticateApiKey(undefined, makeRepository());

  assert.equal(result.authenticated, false);
  if (!result.authenticated) assert.equal(result.statusCode, 401);
});

test("rejects a malformed API key without querying the repository", async () => {
  let queried = false;
  const repository = makeRepository();
  repository.findActiveByHash = async () => {
    queried = true;
    return undefined;
  };

  const result = await authenticateApiKey("Bearer invalid", repository);

  assert.equal(result.authenticated, false);
  assert.equal(queried, false);
});

test("rejects an unknown API key", async () => {
  const result = await authenticateApiKey(
    `Bearer ${generateApiKey().key}`,
    makeRepository(),
  );

  assert.equal(result.authenticated, false);
});

test("accepts a valid API key and records its use", async () => {
  const generated = generateApiKey();
  const repository = makeRepository(makeRecord(generated.hash));

  const result = await authenticateApiKey(
    `Bearer ${generated.key}`,
    repository,
  );

  assert.deepEqual(result, {
    authenticated: true,
    identity: { userId: "user-1", apiKeyId: "key-1", role: "member" },
  });
  assert.deepEqual(repository.markedUsed, ["key-1"]);
});

test("rejects a revoked API key", async () => {
  const generated = generateApiKey();
  const repository = makeRepository(
    makeRecord(generated.hash, { revokedAt: new Date() }),
  );

  const result = await authenticateApiKey(
    `Bearer ${generated.key}`,
    repository,
  );

  assert.equal(result.authenticated, false);
  assert.deepEqual(repository.markedUsed, []);
});

test("rejects authentication when the repository lookup fails", async () => {
  const repository = makeRepository();
  repository.findActiveByHash = async () => {
    throw new Error("database unavailable");
  };

  const result = await authenticateApiKey(
    `Bearer ${generateApiKey().key}`,
    repository,
  );

  assert.equal(result.authenticated, false);
});

test("rejects a key whose user no longer exists", async () => {
  const generated = generateApiKey();
  const repository = makeRepository(makeRecord(generated.hash));
  repository.findUserRole = async () => undefined;

  const result = await authenticateApiKey(
    `Bearer ${generated.key}`,
    repository,
  );

  assert.equal(result.authenticated, false);
  assert.deepEqual(repository.markedUsed, []);
});

test("includes the database-backed admin role in the identity", async () => {
  const generated = generateApiKey();
  const repository = makeRepository(makeRecord(generated.hash));
  repository.findUserRole = async () => "admin";

  const result = await authenticateApiKey(
    `Bearer ${generated.key}`,
    repository,
  );

  assert.equal(result.authenticated, true);
  if (result.authenticated) assert.equal(result.identity.role, "admin");
});

test("rejects authentication when recording key usage fails", async () => {
  const generated = generateApiKey();
  const repository = makeRepository(makeRecord(generated.hash));
  repository.markUsed = async () => {
    throw new Error("database unavailable");
  };

  const result = await authenticateApiKey(
    `Bearer ${generated.key}`,
    repository,
  );

  assert.equal(result.authenticated, false);
});
