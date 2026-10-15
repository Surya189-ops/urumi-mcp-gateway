import type { HealthStatus } from "@urumi/shared";

export interface UpstreamServerConfig {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
}

export interface UpstreamServerState {
  config: UpstreamServerConfig;
  status: HealthStatus;
  lastError?: string;
}
