export type AuditOutcome = "success" | "error";

export interface AuditLogRecord {
  id: string;
  userId: string | null;
  upstreamId: string | null;
  toolName: string;
  outcome: AuditOutcome;
  durationMs: number | null;
  errorMessage: string | null;
  createdAt: Date;
}

export interface CreateAuditLogInput {
  userId?: string | null;
  upstreamId?: string | null;
  toolName: string;
  outcome: AuditOutcome;
  durationMs?: number | null;
  errorMessage?: string | null;
}

export interface AuditRepository {
  create(input: CreateAuditLogInput): Promise<AuditLogRecord>;
  list(options?: {
    limit?: number;
    userId?: string;
  }): Promise<AuditLogRecord[]>;
}
