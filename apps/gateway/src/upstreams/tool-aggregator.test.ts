import assert from "node:assert/strict";
import test from "node:test";
import { ToolAggregator } from "./tool-aggregator.js";
import type { ConnectedUpstream } from "./connection-manager.js";

function fakeUpstream(
  id: string,
  name: string,
  toolNames: string[],
  shouldFail = false,
): ConnectedUpstream {
  const client = {
    listTools: async () => {
      if (shouldFail) {
        throw new Error("Upstream unavailable");
      }

      return {
        tools: toolNames.map((toolName) => ({
          name: toolName,
          description: `Tool ${toolName}`,
          inputSchema: { type: "object" as const, properties: {} },
        })),
      };
    },
  };

  return {
    config: {
      id,
      name,
      url: `http://${id}:3000/mcp`,
      enabled: true,
    },
    client: client as unknown as ConnectedUpstream["client"],
    transport: {} as ConnectedUpstream["transport"],
  };
}

test("namespaces tools with their upstream IDs", async () => {
  const aggregator = new ToolAggregator();
  const tools = await aggregator.listTools([
    fakeUpstream("store", "Store", ["list_products"]),
    fakeUpstream("analytics", "Analytics", ["list_products"]),
  ]);

  assert.deepEqual(
    tools.map((tool) => tool.name),
    ["store__list_products", "analytics__list_products"],
  );
});

test("continues discovery when one upstream fails", async () => {
  const aggregator = new ToolAggregator();
  const tools = await aggregator.listTools([
    fakeUpstream("offline", "Offline", ["hidden_tool"], true),
    fakeUpstream("healthy", "Healthy", ["ping"]),
  ]);

  assert.deepEqual(tools.map((tool) => tool.name), ["healthy__ping"]);
});

test("returns an empty list when no upstreams are connected", async () => {
  const aggregator = new ToolAggregator();

  assert.deepEqual(await aggregator.listTools([]), []);
});
