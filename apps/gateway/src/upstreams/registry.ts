import type {
  UpstreamServerConfig,
  UpstreamServerState,
} from "./types.js";

export class UpstreamRegistry {
  private readonly servers = new Map<string, UpstreamServerState>();

  list(): UpstreamServerState[] {
    return Array.from(this.servers.values(), (state) => ({
      ...state,
      config: { ...state.config },
    }));
  }

  get(id: string): UpstreamServerState | undefined {
    const state = this.servers.get(id);

    return state
      ? { ...state, config: { ...state.config } }
      : undefined;
  }

  register(config: UpstreamServerConfig): UpstreamServerState {
    if (this.servers.has(config.id)) {
      throw new Error(`Upstream server "${config.id}" is already registered.`);
    }

    const state: UpstreamServerState = {
      config: { ...config },
      status: config.enabled ? "unreachable" : "disabled",
    };

    this.servers.set(config.id, state);
    return { ...state, config: { ...state.config } };
  }

  update(
    id: string,
    changes: Partial<Omit<UpstreamServerConfig, "id">>,
  ): UpstreamServerState {
    const current = this.servers.get(id);

    if (!current) {
      throw new Error(`Upstream server "${id}" was not found.`);
    }

    const config = { ...current.config, ...changes };
    const state: UpstreamServerState = {
      ...current,
      config,
      status: config.enabled ? "unreachable" : "disabled",
      lastError: undefined,
    };

    this.servers.set(id, state);
    return { ...state, config: { ...state.config } };
  }

  setHealth(
    id: string,
    status: "connected" | "unreachable",
    lastError?: string,
  ): void {
    const current = this.servers.get(id);

    if (!current) {
      throw new Error(`Upstream server "${id}" was not found.`);
    }

    if (!current.config.enabled) {
      this.servers.set(id, {
        ...current,
        status: "disabled",
        lastError: undefined,
      });
      return;
    }

    this.servers.set(id, {
      ...current,
      status,
      lastError,
    });
  }

  remove(id: string): boolean {
    return this.servers.delete(id);
  }
}
