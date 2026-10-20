import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { WooCommerceClient } from "./woocommerce-client.js";
import { registerWooCommerceTools } from "./tools.js";

const app = Fastify({ logger: true });

app.get("/health", async () => ({
  status: "ok",
  service: "woo-mcp-server",
}));

app.post("/mcp", async (request, reply) => {
  const server = new McpServer({
    name: "urumi-woocommerce",
    version: "1.0.0",
  });

  const woo = new WooCommerceClient();
  registerWooCommerceTools(server, woo);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  await server.connect(transport);
  reply.hijack();

  try {
    await transport.handleRequest(
      request.raw,
      reply.raw,
      request.body,
    );
  } finally {
    await transport.close();
    await server.close();
  }
});

const port = Number(process.env.PORT ?? 3100);
const host = process.env.HOST ?? "0.0.0.0";

await app.listen({ port, host });
app.log.info(`WooCommerce MCP server listening on ${host}:${port}`);
