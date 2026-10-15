import assert from "node:assert/strict";
import test from "node:test";
import { UpstreamConnectionManager } from "./connection-manager.js";

test("rejects a disabled upstream before connecting", async () => {
  const manager = new UpstreamConnectionManager();

  await assert.rejects(
    manager.connect({
      id: "disabled",
      name: "Disabled server",
      url: "http://127.0.0.1:3999/mcp",
      enabled: false,
    }),
    /is disabled/,
  );

  assert.equal(manager.list().length, 0);
});

test("rejects a duplicate connection when the server is already connected", async () => {
  const manager = new UpstreamConnectionManager();

  const config = {
    id: "duplicate",
    name: "Duplicate server",
    url: "http://127.0.0.1:3999/mcp",
    enabled: true,
  };

  // Simulate an existing connection without opening a network connection.
  const connections = (
    manager as unknown as {
      connections: Map<string, unknown>;
    }
  ).connections;

  connections.set("duplicate", {} as never);

  await assert.rejects(
    manager.connect(config),
    /already connected/,
  );
});
