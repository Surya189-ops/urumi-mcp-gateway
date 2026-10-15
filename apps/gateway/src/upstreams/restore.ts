import type { UpstreamRepository } from "../db/upstream-repository.js";
import type { UpstreamConnectionManager } from "./connection-manager.js";
import { upstreamConnections, upstreamRegistry } from "./runtime.js";
import type { UpstreamRegistry } from "./registry.js";

export interface RestoreDependencies {
  repository: UpstreamRepository;
  registry?: UpstreamRegistry;
  connections?: UpstreamConnectionManager;
}

export async function restoreUpstreams({
  repository,
  registry = upstreamRegistry,
  connections = upstreamConnections,
}: RestoreDependencies): Promise<void> {
  const configs = await repository.list();

  for (const config of configs) {
    if (!registry.get(config.id)) {
      registry.register(config);
    }

    if (!config.enabled) {
      continue;
    }

    if (connections.get(config.id)) {
      registry.setHealth(config.id, "connected");
      continue;
    }

    try {
      await connections.connect(config);
      registry.setHealth(config.id, "connected");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown connection error";

      registry.setHealth(config.id, "unreachable", message);
    }
  }
}
