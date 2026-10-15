export interface ApiKeyRecord {
  id: string;
  userId: string;
  name: string;
  keyHash: string;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}

export interface ApiKeyRepository {
  create(input: {
    id: string;
    userId: string;
    name: string;
    keyHash: string;
  }): Promise<ApiKeyRecord>;

  findActiveByHash(keyHash: string): Promise<ApiKeyRecord | undefined>;

  listByUser(userId: string): Promise<ApiKeyRecord[]>;

  markUsed(id: string): Promise<void>;

  revoke(id: string, userId: string): Promise<boolean>;
}
