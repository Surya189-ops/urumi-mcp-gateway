import type { UpstreamServerConfig } from "../upstreams/types.js";

export interface UpstreamRepository {
  list(): Promise<UpstreamServerConfig[]>;
  get(id: string): Promise<UpstreamServerConfig | undefined>;
  create(config: UpstreamServerConfig): Promise<UpstreamServerConfig>;
  update(
    id: string,
    changes: Partial<Omit<UpstreamServerConfig, "id">>,
  ): Promise<UpstreamServerConfig | undefined>;
  delete(id: string): Promise<boolean>;
}
