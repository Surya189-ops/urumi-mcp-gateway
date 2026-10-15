import assert from "node:assert/strict";
import test from "node:test";
import {
  generateApiKey,
  hashApiKey,
  hasValidApiKeyFormat,
} from "./api-key.js";

test("generates a correctly formatted API key", () => {
  const generated = generateApiKey();

  assert.match(generated.key, /^urumi_[A-Za-z0-9_-]{43}$/);
  assert.equal(hasValidApiKeyFormat(generated.key), true);
});

test("generates unique keys with different hashes", () => {
  const first = generateApiKey();
  const second = generateApiKey();

  assert.notEqual(first.key, second.key);
  assert.notEqual(first.hash, second.hash);
});

test("hashing is deterministic and does not return the raw key", () => {
  const generated = generateApiKey();

  assert.equal(hashApiKey(generated.key), generated.hash);
  assert.match(generated.hash, /^[a-f0-9]{64}$/);
  assert.notEqual(generated.hash, generated.key);
});

test("rejects malformed API-key formats", () => {
  assert.equal(hasValidApiKeyFormat(""), false);
  assert.equal(hasValidApiKeyFormat("not-a-key"), false);
  assert.equal(hasValidApiKeyFormat("urumi_too-short"), false);
  assert.equal(hasValidApiKeyFormat(`urumi_${"x".repeat(44)}`), false);
});
