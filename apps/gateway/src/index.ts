import Fastify from "fastify";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  upstreamConnections,
  toolAggregator,
} from "./upstreams/runtime.js";

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

  const connections = upstreamConnections.list();
  const tools = await toolAggregator.listTools(connections);

  for (const tool of tools) {
    const connection = upstreamConnections.get(tool.upstreamId);

    if (!connection) {
      continue;
    }

    try {
      const inputSchema = z.fromJSONSchema(tool.inputSchema as never);

      mcpServer.registerTool(
        tool.name,
        {
          description:
            tool.description ??
            `Tool ${tool.originalToolName} from ${tool.upstreamName}`,
          inputSchema,
        },
        async (args) => {
          try {
            const result = await connection.client.callTool(
              {
                name: tool.originalToolName,
                arguments: args as Record<string, unknown>,
              },
              undefined,
              { timeout: 10000 },
            );

            if (!("content" in result) || !Array.isArray(result.content)) {
              return {
                content: [
                  {
                    type: "text" as const,
                    text: "The upstream returned a task result instead of a direct tool result.",
                  },
                ],
                isError: true,
              };
            }

            return {
              content: result.content,
              ...(result.structuredContent !== null &&
              typeof result.structuredContent === "object" &&
              !Array.isArray(result.structuredContent)
                ? {
                    structuredContent: result.structuredContent as Record<
                      string,
                      unknown
                    >,
                  }
                : {}),
              ...(typeof result.isError === "boolean"
                ? { isError: result.isError }
                : {}),
            };
          } catch (error) {
            const message =
              error instanceof Error ? error.message : "Unknown upstream error";

            return {
              content: [
                {
                  type: "text" as const,
                  text: `Upstream tool call failed: ${message}`,
                },
              ],
              isError: true,
            };
          }
        },
      );
    } catch (error) {
      app.log.warn(
        { toolName: tool.name, error },
        "Skipping upstream tool that could not be registered",
      );
    }
  }

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
