import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerWooCommerceTools } from "./tools.js";
import { WooCommerceClient } from "./woocommerce-client.js";

test("registers all five required WooCommerce MCP tools", async () => {
  const previous = {
    url: process.env.WOOCOMMERCE_URL,
    key: process.env.WOOCOMMERCE_CONSUMER_KEY,
    secret: process.env.WOOCOMMERCE_CONSUMER_SECRET,
  };

  process.env.WOOCOMMERCE_URL = "http://127.0.0.1:8080";
  process.env.WOOCOMMERCE_CONSUMER_KEY = "test_key";
  process.env.WOOCOMMERCE_CONSUMER_SECRET = "test_secret";

  const server = new McpServer({ name: "woo-test", version: "1.0.0" });
  const woo = new WooCommerceClient();
  registerWooCommerceTools(server, woo);

  const client = new Client({ name: "woo-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const result = await client.listTools();
    const names = result.tools.map((tool) => tool.name).sort();

    assert.deepEqual(names, [
      "create_product",
      "get_order",
      "list_orders",
      "list_products",
      "update_order_status",
    ]);
  } finally {
    await client.close();
    await server.close();
    for (const [name, value] of [
      ["WOOCOMMERCE_URL", previous.url],
      ["WOOCOMMERCE_CONSUMER_KEY", previous.key],
      ["WOOCOMMERCE_CONSUMER_SECRET", previous.secret],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
