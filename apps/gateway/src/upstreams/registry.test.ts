import assert from "node:assert/strict";
import test from "node:test";
import { UpstreamRegistry } from "./registry.js";

test("registers an enabled server as initially unreachable", () => {
  const registry = new UpstreamRegistry();

  const server = registry.register({
    id: "store",
    name: "WooCommerce",
    url: "http://woo-mcp:3001/mcp",
    enabled: true,
  });

  assert.equal(server.config.id, "store");
  assert.equal(server.status, "unreachable");
});

test("rejects duplicate server IDs", () => {
  const registry = new UpstreamRegistry();
  const config = {
    id: "store",
    name: "WooCommerce",
    url: "http://woo-mcp:3001/mcp",
    enabled: true,
  };

  registry.register(config);

  assert.throws(() => registry.register(config), /already registered/);
});

test("marks disabled servers as disabled", () => {
  const registry = new UpstreamRegistry();

  const server = registry.register({
    id: "analytics",
    name: "Analytics",
    url: "http://analytics:3002/mcp",
    enabled: false,
  });

  assert.equal(server.status, "disabled");
});

test("updates health for enabled servers", () => {
  const registry = new UpstreamRegistry();

  registry.register({
    id: "store",
    name: "WooCommerce",
    url: "http://woo-mcp:3001/mcp",
    enabled: true,
  });

  registry.setHealth("store", "connected");

  assert.equal(registry.get("store")?.status, "connected");
});

test("does not mark a disabled server as connected", () => {
  const registry = new UpstreamRegistry();

  registry.register({
    id: "analytics",
    name: "Analytics",
    url: "http://analytics:3002/mcp",
    enabled: false,
  });

  registry.setHealth("analytics", "connected");

  assert.equal(registry.get("analytics")?.status, "disabled");
});

test("updates configuration and resets health appropriately", () => {
  const registry = new UpstreamRegistry();

  registry.register({
    id: "store",
    name: "WooCommerce",
    url: "http://woo-mcp:3001/mcp",
    enabled: true,
  });

  registry.setHealth("store", "connected");
  const updated = registry.update("store", { enabled: false });

  assert.equal(updated.config.enabled, false);
  assert.equal(updated.status, "disabled");
});

test("removes a server", () => {
  const registry = new UpstreamRegistry();

  registry.register({
    id: "store",
    name: "WooCommerce",
    url: "http://woo-mcp:3001/mcp",
    enabled: true,
  });

  assert.equal(registry.remove("store"), true);
  assert.equal(registry.get("store"), undefined);
  assert.equal(registry.remove("store"), false);
});
