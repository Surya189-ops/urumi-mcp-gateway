import Fastify from "fastify";
import type { UpstreamRepository } from "./db/upstream-repository.js";
import type { ApiKeyRepository } from "./db/api-key-repository.js";
import type { UserRepository } from "./db/user-repository.js";
import type { AuditRepository } from "./db/audit-repository.js";
import type { UpstreamConnectionManager } from "./upstreams/connection-manager.js";
import type { ToolAggregator } from "./upstreams/tool-aggregator.js";
import type { ProvisionedTeamMember } from "./db/provision-team-member.js";
import { randomUUID } from "node:crypto";
import { authenticateApiKey } from "./auth/authenticate-api-key.js";
import { generateApiKey } from "./auth/api-key.js";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  upstreamConnections,
  upstreamRegistry,
  toolAggregator,
} from "./upstreams/runtime.js";

export interface BuildAppOptions {
  upstreamRepository?: UpstreamRepository;
  apiKeyRepository?: ApiKeyRepository;
  userRepository?: UserRepository;
  auditRepository?: AuditRepository;
  upstreamConnectionManager?: Pick<UpstreamConnectionManager, "list" | "get">;
  toolAggregator?: Pick<ToolAggregator, "listTools">;
  provisionTeamMember?: (input: {
    email: string;
    displayName: string;
    keyName?: string;
  }) => Promise<ProvisionedTeamMember>;
  authRequired?: boolean;
}

export function buildApp(
  options: BuildAppOptions | UpstreamRepository = {},
) {
  const normalizedOptions: BuildAppOptions =
    typeof (options as UpstreamRepository).list === "function"
      ? { upstreamRepository: options as UpstreamRepository }
      : options as BuildAppOptions;

  const repository = normalizedOptions.upstreamRepository;
  const apiKeyRepository = normalizedOptions.apiKeyRepository;
  const userRepository = normalizedOptions.userRepository;
  const auditRepository = normalizedOptions.auditRepository;
  const connectionManager = normalizedOptions.upstreamConnectionManager ?? upstreamConnections;
  const aggregator = normalizedOptions.toolAggregator ?? toolAggregator;
  const provisionMember = normalizedOptions.provisionTeamMember;
  const authRequired = normalizedOptions.authRequired ?? false;

  const app = Fastify({
    logger: true,
  });

  app.get("/health", async () => ({
    status: "ok",
    service: "urumi-gateway",
  }));

  async function authorizeRequest(
    authorization: string | undefined,
    adminOnly = false,
  ): Promise<
    | { ok: true; userId: string; apiKeyId: string; role: "admin" | "member" }
    | { ok: false; statusCode: 401 | 403; error: string }
  > {
    if (!authRequired) {
      return {
        ok: true,
        userId: "test-user",
        apiKeyId: "test-key",
        role: "admin",
      };
    }

    if (!apiKeyRepository) {
      return {
        ok: false,
        statusCode: 401,
        error: "API-key authentication is not configured",
      };
    }

    const result = await authenticateApiKey(authorization, apiKeyRepository);
    if (!result.authenticated) {
      return {
        ok: false,
        statusCode: result.statusCode,
        error: result.error,
      };
    }

    if (adminOnly && result.identity.role !== "admin") {
      return {
        ok: false,
        statusCode: 403,
        error: "Administrator role required",
      };
    }

    return { ok: true, ...result.identity };
  }

  app.get("/admin/upstreams", async (request, reply) => {
    const authorization = await authorizeRequest(
      request.headers.authorization,
      true,
    );
    if (!authorization.ok) {
      return reply.code(authorization.statusCode).send({
        error: authorization.error,
      });
    }

    if (repository) {
      const configs = await repository.list();
      return configs.map((config) => {
        const runtime = upstreamRegistry.get(config.id);
        return {
          ...config,
          status: config.enabled
            ? runtime?.status ?? "unreachable"
            : "disabled",
          ...(runtime?.lastError ? { lastError: runtime.lastError } : {}),
        };
      });
    }

    return upstreamRegistry.list().map((server) => ({
      id: server.config.id,
      name: server.config.name,
      url: server.config.url,
      enabled: server.config.enabled,
      status: server.status,
      ...(server.lastError ? { lastError: server.lastError } : {}),
    }));
  });

  app.post("/admin/upstreams", async (request, reply) => {
    const authorization = await authorizeRequest(
      request.headers.authorization,
      true,
    );
    if (!authorization.ok) {
      return reply.code(authorization.statusCode).send({
        error: authorization.error,
      });
    }

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

    if (repository) {
      try {
        await repository.create(parsed.data);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Database write failed";

        if (
          error !== null &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "23505"
        ) {
          return reply.code(409).send({
            error: "An upstream with this ID already exists",
          });
        }

        request.log.error({ error }, "Failed to persist upstream configuration");
        return reply.code(500).send({ error: "Failed to save upstream configuration" });
      }
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

  app.patch("/admin/upstreams/:id", async (request, reply) => {
    const authorization = await authorizeRequest(
      request.headers.authorization,
      true,
    );
    if (!authorization.ok) {
      return reply.code(authorization.statusCode).send({
        error: authorization.error,
      });
    }

    const params = z.object({ id: z.string().trim().min(1).max(100) });
    const body = z.object({
      name: z.string().trim().min(1).max(200).optional(),
      url: z.string().url().refine((value) => {
        const protocol = new URL(value).protocol;
        return protocol === "http:" || protocol === "https:";
      }, "URL must use HTTP or HTTPS").optional(),
      enabled: z.boolean().optional(),
    }).refine((value) => Object.keys(value).length > 0, {
      message: "At least one field must be provided",
    });

    const parsedParams = params.safeParse(request.params);
    const parsedBody = body.safeParse(request.body);

    if (!parsedParams.success || !parsedBody.success) {
      return reply.code(400).send({ error: "Invalid upstream update" });
    }

    const id = parsedParams.data.id;
    const existingConfig = repository
      ? await repository.get(id)
      : upstreamRegistry.get(id)?.config;

    if (!existingConfig) {
      return reply.code(404).send({ error: "Upstream server was not found" });
    }

    if (repository) {
      try {
        const persisted = await repository.update(id, parsedBody.data);
        if (!persisted) {
          return reply.code(404).send({ error: "Upstream server was not found" });
        }
      } catch (error) {
        request.log.error({ id, error }, "Failed to persist upstream update");
        return reply.code(500).send({ error: "Failed to save upstream configuration" });
      }
    }

    if (!upstreamRegistry.get(id)) {
      upstreamRegistry.register(existingConfig);
    }

    try {
      await upstreamConnections.disconnect(id);
    } catch (error) {
      request.log.warn({ id, error }, "Failed to close the previous upstream connection");
    }

    let updated = upstreamRegistry.update(id, parsedBody.data);

    if (updated.config.enabled) {
      try {
        await upstreamConnections.connect(updated.config);
        upstreamRegistry.setHealth(id, "connected");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown connection error";
        upstreamRegistry.setHealth(id, "unreachable", message);
      }
    }

    updated = upstreamRegistry.get(id)!;

    return reply.code(200).send({
      id: updated.config.id,
      name: updated.config.name,
      url: updated.config.url,
      enabled: updated.config.enabled,
      status: updated.status,
      ...(updated.lastError ? { lastError: updated.lastError } : {}),
    });
  });

  app.delete("/admin/upstreams/:id", async (request, reply) => {
    const authorization = await authorizeRequest(
      request.headers.authorization,
      true,
    );
    if (!authorization.ok) {
      return reply.code(authorization.statusCode).send({
        error: authorization.error,
      });
    }

    const parsedParams = z.object({
      id: z.string().trim().min(1).max(100),
    }).safeParse(request.params);

    if (!parsedParams.success) {
      return reply.code(400).send({ error: "Invalid upstream ID" });
    }

    const id = parsedParams.data.id;
    const existingConfig = repository
      ? await repository.get(id)
      : upstreamRegistry.get(id)?.config;

    if (!existingConfig) {
      return reply.code(404).send({ error: "Upstream server was not found" });
    }

    try {
      await upstreamConnections.disconnect(id);
    } catch (error) {
      request.log.error(
        { id, error },
        "Failed to fully close upstream connection during deletion",
      );
      return reply.code(500).send({
        error: "Failed to close upstream connection; deletion was not completed",
      });
    }

    if (repository) {
      try {
        const deleted = await repository.delete(id);
        if (!deleted) {
          return reply.code(404).send({ error: "Upstream server was not found" });
        }
      } catch (error) {
        request.log.error({ id, error }, "Failed to delete persisted upstream");
        return reply.code(500).send({ error: "Failed to delete upstream configuration" });
      }
    }

    upstreamRegistry.remove(id);

    return reply.code(204).send();
  });

  app.post("/mcp", async (request, reply) => {
    const authorization = await authorizeRequest(
      request.headers.authorization,
    );
    if (!authorization.ok) {
      return reply.code(authorization.statusCode).send({
        error: authorization.error,
      });
    }

    const mcpServer = new McpServer({
      name: "urumi-gateway",
      version: "1.0.0",
    });

    mcpServer.registerTool(
      "ping",
      {
        description: "Check whether the Urumi MCP gateway is responding.",
      },
      async () => {
        if (auditRepository) {
          try {
            await auditRepository.create({
              userId: authorization.userId,
              upstreamId: undefined,
              toolName: "ping",
              outcome: "success",
              durationMs: 0,
            });
          } catch (auditError) {
            request.log.error(
              {
                toolName: "ping",
                errorType:
                  auditError instanceof Error
                    ? auditError.name
                    : "UnknownError",
              },
              "Failed to persist tool audit log",
            );
          }
        }

        return {
          content: [{ type: "text" as const, text: "pong" }],
        };
      },
    );

    const connections = connectionManager.list();
    const tools = await aggregator.listTools(connections);

    for (const tool of tools) {
      const connection = connectionManager.get(tool.upstreamId);

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
            const startedAt = Date.now();

            const recordAudit = async (
              outcome: "success" | "error",
              errorMessage?: string,
            ) => {
              if (!auditRepository) {
                return;
              }

              try {
                await auditRepository.create({
                  userId: authorization.userId,
                  upstreamId: tool.upstreamId,
                  toolName: tool.name,
                  outcome,
                  durationMs: Math.max(0, Date.now() - startedAt),
                  ...(errorMessage ? { errorMessage } : {}),
                });
              } catch (auditError) {
                request.log.error(
                  {
                    toolName: tool.name,
                    upstreamId: tool.upstreamId,
                    errorType:
                      auditError instanceof Error
                        ? auditError.name
                        : "UnknownError",
                  },
                  "Failed to persist tool audit log",
                );
              }
            };

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
                await recordAudit(
                  "error",
                  "Upstream returned a task result instead of a direct tool result.",
                );

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

              if (result.isError === true) {
                await recordAudit(
                  "error",
                  "Upstream tool returned isError=true.",
                );
              } else {
                await recordAudit("success");
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
              await recordAudit("error", "Upstream tool call failed.");

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


  app.post("/api-keys", async (request, reply) => {
    const authorization = await authorizeRequest(request.headers.authorization);
    if (!authorization.ok) {
      return reply.code(authorization.statusCode).send({
        error: authorization.error,
      });
    }

    if (!apiKeyRepository) {
      return reply.code(503).send({ error: "API-key storage is not configured" });
    }

    const parsed = z.object({
      name: z.string().trim().min(1).max(100),
    }).safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({ error: "A key name between 1 and 100 characters is required" });
    }

    const generated = generateApiKey();

    try {
      const record = await apiKeyRepository.create({
        id: crypto.randomUUID(),
        userId: authorization.userId,
        name: parsed.data.name,
        keyHash: generated.hash,
      });

      return reply.code(201).send({
        id: record.id,
        name: record.name,
        key: generated.key,
        createdAt: record.createdAt,
        message: "Save this key now. It will not be shown again.",
      });
    } catch (error) {
      request.log.error({ error }, "Failed to create API key");
      return reply.code(500).send({ error: "Failed to create API key" });
    }
  });

  app.get("/api-keys", async (request, reply) => {
    const authorization = await authorizeRequest(request.headers.authorization);
    if (!authorization.ok) {
      return reply.code(authorization.statusCode).send({
        error: authorization.error,
      });
    }

    if (!apiKeyRepository) {
      return reply.code(503).send({ error: "API-key storage is not configured" });
    }

    try {
      const records = await apiKeyRepository.listByUser(authorization.userId);
      return records.map((record) => ({
        id: record.id,
        name: record.name,
        createdAt: record.createdAt,
        lastUsedAt: record.lastUsedAt,
        revokedAt: record.revokedAt,
        active: record.revokedAt === null,
      }));
    } catch (error) {
      request.log.error({ error }, "Failed to list API keys");
      return reply.code(500).send({ error: "Failed to list API keys" });
    }
  });

  app.delete("/api-keys/:id", async (request, reply) => {
    const authorization = await authorizeRequest(request.headers.authorization);
    if (!authorization.ok) {
      return reply.code(authorization.statusCode).send({
        error: authorization.error,
      });
    }

    if (!apiKeyRepository) {
      return reply.code(503).send({ error: "API-key storage is not configured" });
    }

    const parsed = z.object({
      id: z.string().uuid(),
    }).safeParse(request.params);

    if (!parsed.success) {
      return reply.code(400).send({ error: "Invalid API-key ID" });
    }

    try {
      const revoked = await apiKeyRepository.revoke(
        parsed.data.id,
        authorization.userId,
      );

      if (!revoked) {
        return reply.code(404).send({
          error: "API key was not found, does not belong to you, or is already revoked",
        });
      }

      return reply.code(204).send();
    } catch (error) {
      request.log.error({ error }, "Failed to revoke API key");
      return reply.code(500).send({ error: "Failed to revoke API key" });
    }
  });


  app.get("/admin/users", async (request, reply) => {
    const authorization = await authorizeRequest(
      request.headers.authorization, true,
    );
    if (!authorization.ok) {
      return reply.code(authorization.statusCode).send({ error: authorization.error });
    }
    if (!userRepository) {
      return reply.code(503).send({ error: "User storage is not configured" });
    }

    try {
      const users = await userRepository.list();
      return users.map(({ id, email, displayName, role, createdAt, updatedAt }) => ({
        id, email, displayName, role, createdAt, updatedAt,
      }));
    } catch (error) {
      request.log.error({ error }, "Failed to list team members");
      return reply.code(500).send({ error: "Failed to list team members" });
    }
  });

  app.post("/admin/users", async (request, reply) => {
    const authorization = await authorizeRequest(
      request.headers.authorization, true,
    );
    if (!authorization.ok) {
      return reply.code(authorization.statusCode).send({ error: authorization.error });
    }
    if (!provisionMember) {
      return reply.code(503).send({
        error: "Transactional member provisioning is not configured",
      });
    }

    const parsed = z.object({
      email: z.string().trim().email().max(254),
      displayName: z.string().trim().min(1).max(200),
      keyName: z.string().trim().min(1).max(100).optional(),
    }).safeParse(request.body);

    if (!parsed.success) {
      return reply.code(400).send({
        error: "A valid email, display name, and optional key name are required",
      });
    }

    try {
      const provisioned = await provisionMember(parsed.data);
      const { user, apiKey } = provisioned;
      return reply.code(201).send({
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
        apiKey: {
          id: apiKey.id,
          name: apiKey.name,
          key: apiKey.key,
          createdAt: apiKey.createdAt,
        },
        message: "Save this API key now. It will not be shown again.",
      });
    } catch (error) {
      if (
        error !== null && typeof error === "object" &&
        "code" in error && error.code === "23505"
      ) {
        return reply.code(409).send({ error: "A user with this email already exists" });
      }
      request.log.error({ error }, "Failed to create team member");
      return reply.code(500).send({ error: "Failed to create team member" });
    }
  });

  app.patch("/admin/users/:id/role", async (request, reply) => {
    const authorization = await authorizeRequest(
      request.headers.authorization, true,
    );
    if (!authorization.ok) {
      return reply.code(authorization.statusCode).send({ error: authorization.error });
    }
    if (!userRepository) {
      return reply.code(503).send({ error: "User storage is not configured" });
    }

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params);
    const body = z.object({
      role: z.enum(["admin", "member"]),
    }).safeParse(request.body);

    if (!params.success || !body.success) {
      return reply.code(400).send({ error: "A valid user ID and role are required" });
    }

    try {
      const user = await userRepository.updateRole(
        params.data.id, body.data.role,
      );
      if (!user) {
        return reply.code(404).send({ error: "Team member not found" });
      }
      return {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
    } catch (error) {
      request.log.error({ error }, "Failed to update team member role");
      return reply.code(500).send({ error: "Failed to update team member role" });
    }
  });

  return app;
}
