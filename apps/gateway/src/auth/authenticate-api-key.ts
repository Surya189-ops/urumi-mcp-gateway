import type { ApiKeyRepository, ApiKeyRecord } from "../db/api-key-repository.js";
import { hashApiKey, hasValidApiKeyFormat } from "./api-key.js";

export interface AuthenticatedIdentity {
  userId: string;
  apiKeyId: string;
  role: "admin" | "member";
}

export type AuthenticationResult =
  | { authenticated: true; identity: AuthenticatedIdentity }
  | { authenticated: false; statusCode: 401; error: string };

export async function authenticateApiKey(
  authorization: string | undefined,
  repository: ApiKeyRepository,
): Promise<AuthenticationResult> {
  if (!authorization?.startsWith("Bearer ")) {
    return {
      authenticated: false,
      statusCode: 401,
      error: "A bearer API key is required",
    };
  }

  const key = authorization.slice("Bearer ".length).trim();

  if (!hasValidApiKeyFormat(key)) {
    return {
      authenticated: false,
      statusCode: 401,
      error: "Invalid API key",
    };
  }

  let record: ApiKeyRecord | undefined;

  try {
    record = await repository.findActiveByHash(hashApiKey(key));
  } catch {
    return {
      authenticated: false,
      statusCode: 401,
      error: "API key authentication failed",
    };
  }

  if (!record || record.revokedAt !== null) {
    return {
      authenticated: false,
      statusCode: 401,
      error: "Invalid or revoked API key",
    };
  }

  let role: "admin" | "member" | undefined;

  try {
    role = await repository.findUserRole(record.userId);
  } catch {
    return {
      authenticated: false,
      statusCode: 401,
      error: "API key authentication failed",
    };
  }

  if (!role) {
    return {
      authenticated: false,
      statusCode: 401,
      error: "API key owner was not found",
    };
  }

  try {
    await repository.markUsed(record.id);
  } catch {
    return {
      authenticated: false,
      statusCode: 401,
      error: "API key authentication failed",
    };
  }

  return {
    authenticated: true,
    identity: {
      userId: record.userId,
      apiKeyId: record.id,
      role,
    },
  };
}
