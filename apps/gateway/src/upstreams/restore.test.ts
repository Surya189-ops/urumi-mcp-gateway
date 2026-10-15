import assert from "node:assert/strict";
import test from "node:test";
import type { UpstreamRepository } from "../db/upstream-repository.js";
import type { UpstreamServerConfig } from "./types.js";
import type { UpstreamConnectionManager } from "./connection-manager.js";
import { UpstreamRegistry } from "./registry.js";
import { restoreUpstreams } from "./restore.js";

function createRepository(configs: UpstreamServerConfig[]): UpstreamRepository {
  return {
    list: async () => configs,
    get: async () => undefined,
    create: async (config) => config,
    update: async () => undefined,
    delete: async () => false,
  };
}

function createConnectionManager(
  failIds: string[] = [],
): UpstreamConnectionManager {
  const connected = new Map<string, unknown>();
  const manager = {
    get: (id: string) => connected.get(id),
    connect: async (config: UpstreamServerConfig) => {
      if (failIds.includes(config.id)) {
        throw new Error(`Cannot reach ${config.id}`);
      }
      const connection = { config };
      connected.set(config.id, connection);
      return connection;
    },
  };

  return manager as unknown as UpstreamConnectionManager;
}

test("restores an enabled upstream and marks it connected", async () => {
  const registry = new UpstreamRegistry();
  const config = {
    id: "restore-success",
    name: "Successful upstream",
    url: "http://127.0.0.1:3999/mcp",
    enabled: true,
  };

  await restoreUpstreams({
    repository: createRepository([config]),
    registry,
    connections: createConnectionManager(),
  });

  assert.equal(registry.get(config.id)?.status, "connected");
});

test("keeps disabled upstreams disabled without connecting", async () => {
  const registry = new UpstreamRegistry();
  const config = {
    id: "restore-disabled",
    name: "Disabled upstream",
    url: "http://127.0.0.1:3999/mcp",
    enabled: false,
  };
  const manager = createConnectionManager();

  await restoreUpstreams({
    repository: createRepository([config]),
    registry,
    connections: manager,
  });

  assert.equal(registry.get(config.id)?.status, "disabled");
  assert.equal(manager.get(config.id), undefined);
});

test("continues restoring other upstreams when one connection fails", async () => {
  const registry = new UpstreamRegistry();
  const configs = [
    {
      id: "restore-unreachable",
      name: "Unavailable upstream",
      url: "http://127.0.0.1:3998/mcp",
      enabled: true,
    },
    {
      id: "restore-available",
      name: "Available upstream",
      url: "http://127.0.0.1:3999/mcp",
      enabled: true,
    },
  ];

  await restoreUpstreams({
    repository: createRepository(configs),
    registry,
    connections: createConnectionManager(["restore-unreachable"]),
  });

  assert.equal(registry.get("restore-unreachable")?.status, "unreachable");
  assert.match(
    registry.get("restore-unreachable")?.lastError ?? "",
    /Cannot reach restore-unreachable/,
  );
  assert.equal(registry.get("restore-available")?.status, "connected");
});
