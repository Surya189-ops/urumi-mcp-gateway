import Fastify from "fastify";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const app = Fastify({
  logger: true,
});

app.get("/health", async () => ({
  status: "ok",
  service: "urumi-gateway",
}));

app.post("/mcp", async (request, reply) => {
  const mcpServer = new McpServer({
    name: "urumi-gateway",
    version: "1.0.0",
  });

  mcpServer.registerTool(
    "ping",
    {
      description: "Check whether the Urumi MCP gateway is responding.",
    },
    async () => ({
      content: [{ type: "text", text: "pong" }],
    }),
  );

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  await mcpServer.connect(transport);

  reply.hijack();

  try {
    await transport.handleRequest(
      request.raw,
      reply.raw,
      request.body,
    );
  } finally {
    await transport.close();
    await mcpServer.close();
  }
});

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

try {
  await app.listen({ port, host });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
