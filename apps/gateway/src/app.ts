import Fastify from "fastify";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  upstreamConnections,
  upstreamRegistry,
  toolAggregator,
} from "./upstreams/runtime.js";

export function buildApp() {
  const app = Fastify({
    logger: true,
  });

  app.get("/health", async () => ({
    status: "ok",
    service: "urumi-gateway",
  }));

  app.get("/admin/upstreams", async () =>
    upstreamRegistry.list().map((server) => ({
      id: server.config.id,
      name: server.config.name,
      url: server.config.url,
      enabled: server.config.enabled,
      status: server.status,
      ...(server.lastError ? { lastError: server.lastError } : {}),
    })),
  );

  app.post("/admin/upstreams", async (request, reply) => {
    const schema = z.object({
      id: z.string().trim().min(1).max(100),
      name: z.string().trim().min(1).max(200),
      url: z.string().url().refine((value) => {
        const protocol = new URL(value).protocol;
        return protocol === "http:" || protocol === "https:";
      }, "URL must use HTTP or HTTPS"),
      enabled: z.boolean().default(true),
    });

    const parsed = schema.safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid upstream configuration",
        details: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    let server;

    try {
      server = upstreamRegistry.register(parsed.data);
    } catch (error) {
      return reply.code(409).send({
        error: error instanceof Error ? error.message : "Registration failed",
      });
    }

    if (server.config.enabled) {
      try {
        await upstreamConnections.connect(server.config);
        upstreamRegistry.setHealth(server.config.id, "connected");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown connection error";
        upstreamRegistry.setHealth(server.config.id, "unreachable", message);
      }
    }

    const current = upstreamRegistry.get(server.config.id)!;
    return reply.code(201).send({
      id: current.config.id,
      name: current.config.name,
      url: current.config.url,
      enabled: current.config.enabled,
      status: current.status,
      ...(current.lastError ? { lastError: current.lastError } : {}),
    });
  });

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

  return app;
}
