import { createHash, randomBytes } from "node:crypto";

const API_KEY_PREFIX = "urumi_";
const API_KEY_BYTES = 32;

export interface GeneratedApiKey {
  key: string;
  hash: string;
}

export function generateApiKey(): GeneratedApiKey {
  const secret = randomBytes(API_KEY_BYTES).toString("base64url");
  const key = `${API_KEY_PREFIX}${secret}`;

  return {
    key,
    hash: hashApiKey(key),
  };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

export function hasValidApiKeyFormat(key: string): boolean {
  return /^urumi_[A-Za-z0-9_-]{43}$/.test(key);
}
