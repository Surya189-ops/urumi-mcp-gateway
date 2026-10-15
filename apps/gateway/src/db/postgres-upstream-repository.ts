import type { Pool } from "pg";
import type { UpstreamRepository } from "./upstream-repository.js";
import type { UpstreamServerConfig } from "../upstreams/types.js";

interface UpstreamRow {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
}

const SELECT_FIELDS = "id, name, url, enabled";

function toConfig(row: UpstreamRow): UpstreamServerConfig {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    enabled: row.enabled,
  };
}

export class PostgresUpstreamRepository implements UpstreamRepository {
  constructor(private readonly pool: Pool) {}

  async list(): Promise<UpstreamServerConfig[]> {
    const result = await this.pool.query<UpstreamRow>(
      `SELECT ${SELECT_FIELDS} FROM upstream_servers ORDER BY created_at, id`,
    );

    return result.rows.map(toConfig);
  }

  async get(id: string): Promise<UpstreamServerConfig | undefined> {
    const result = await this.pool.query<UpstreamRow>(
      `SELECT ${SELECT_FIELDS} FROM upstream_servers WHERE id = $1`,
      [id],
    );

    const row = result.rows[0];
    return row ? toConfig(row) : undefined;
  }

  async create(
    config: UpstreamServerConfig,
  ): Promise<UpstreamServerConfig> {
    const result = await this.pool.query<UpstreamRow>(
      `INSERT INTO upstream_servers (id, name, url, enabled)
       VALUES ($1, $2, $3, $4)
       RETURNING ${SELECT_FIELDS}`,
      [config.id, config.name, config.url, config.enabled],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error("Creating the upstream server returned no row.");
    }

    return toConfig(row);
  }

  async update(
    id: string,
    changes: Partial<Omit<UpstreamServerConfig, "id">>,
  ): Promise<UpstreamServerConfig | undefined> {
    const result = await this.pool.query<UpstreamRow>(
      `UPDATE upstream_servers
       SET name = COALESCE($2, name),
           url = COALESCE($3, url),
           enabled = COALESCE($4, enabled),
           updated_at = NOW()
       WHERE id = $1
       RETURNING ${SELECT_FIELDS}`,
      [id, changes.name ?? null, changes.url ?? null, changes.enabled ?? null],
    );

    const row = result.rows[0];
    return row ? toConfig(row) : undefined;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.pool.query(
      "DELETE FROM upstream_servers WHERE id = $1",
      [id],
    );

    return result.rowCount !== null && result.rowCount > 0;
  }
}
