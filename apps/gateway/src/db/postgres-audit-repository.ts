import type { Pool } from "pg";
import type {
  AuditLogRecord,
  AuditOutcome,
  AuditRepository,
  CreateAuditLogInput,
} from "./audit-repository.js";

interface AuditRow {
  id: string;
  user_id: string | null;
  upstream_id: string | null;
  tool_name: string;
  outcome: AuditOutcome;
  duration_ms: number | null;
  error_message: string | null;
  created_at: Date;
}

const FIELDS =
  "id, user_id, upstream_id, tool_name, outcome, duration_ms, error_message, created_at";

function toRecord(row: AuditRow): AuditLogRecord {
  return {
    id: row.id,
    userId: row.user_id,
    upstreamId: row.upstream_id,
    toolName: row.tool_name,
    outcome: row.outcome,
    durationMs: row.duration_ms,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  };
}

export class PostgresAuditRepository implements AuditRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: CreateAuditLogInput): Promise<AuditLogRecord> {
    if (!input.toolName.trim()) {
      throw new Error("Audit toolName must not be empty.");
    }

    if (
      input.durationMs != null &&
      (!Number.isSafeInteger(input.durationMs) || input.durationMs < 0)
    ) {
      throw new Error("Audit durationMs must be a non-negative integer.");
    }

    if (input.outcome === "success" && input.errorMessage != null) {
      throw new Error("Successful audit entries cannot have an error message.");
    }

    const result = await this.pool.query<AuditRow>(
      `INSERT INTO audit_logs
         (user_id, upstream_id, tool_name, outcome, duration_ms, error_message)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${FIELDS}`,
      [
        input.userId ?? null,
        input.upstreamId ?? null,
        input.toolName.trim(),
        input.outcome,
        input.durationMs ?? null,
        input.errorMessage?.slice(0, 1000) ?? null,
      ],
    );

    const row = result.rows[0];
    if (!row) throw new Error("Creating the audit entry returned no row.");
    return toRecord(row);
  }

  async list(options: {
    limit?: number;
    userId?: string;
    upstreamId?: string;
    outcome?: AuditOutcome;
    from?: Date;
    to?: Date;
  } = {}): Promise<AuditLogRecord[]> {
    const limit = options.limit ?? 100;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
      throw new Error("Audit list limit must be an integer between 1 and 500.");
    }

    if (
      options.outcome !== undefined &&
      options.outcome !== "success" &&
      options.outcome !== "error"
    ) {
      throw new Error("Audit outcome must be success or error.");
    }

    for (const [name, value] of [["from", options.from], ["to", options.to]] as const) {
      if (value !== undefined && (!(value instanceof Date) || Number.isNaN(value.getTime()))) {
        throw new Error(`Audit ${name} must be a valid date.`);
      }
    }

    if (options.from && options.to && options.from > options.to) {
      throw new Error("Audit from date must not be after the to date.");
    }

    const values: unknown[] = [];
    const conditions: string[] = [];

    if (options.userId !== undefined) {
      values.push(options.userId);
      conditions.push(`user_id = $${values.length}`);
    }

    if (options.upstreamId !== undefined) {
      values.push(options.upstreamId);
      conditions.push(`upstream_id = $${values.length}`);
    }

    if (options.outcome !== undefined) {
      values.push(options.outcome);
      conditions.push(`outcome = $${values.length}`);
    }

    if (options.from !== undefined) {
      values.push(options.from);
      conditions.push(`created_at >= $${values.length}`);
    }

    if (options.to !== undefined) {
      values.push(options.to);
      conditions.push(`created_at <= $${values.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    values.push(limit);

    const result = await this.pool.query<AuditRow>(
      `SELECT ${FIELDS}
       FROM audit_logs
       ${where}
       ORDER BY created_at DESC, id DESC
       LIMIT $${values.length}`,
      values,
    );

    return result.rows.map(toRecord);
  }
}
