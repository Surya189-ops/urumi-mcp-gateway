import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "./app.js";
import type { AuditRepository, CreateAuditLogInput } from "./db/audit-repository.js";
import type { ConnectedUpstream } from "./upstreams/connection-manager.js";
import type { AggregatedTool } from "./upstreams/tool-aggregator.js";

const aggregatedTool: AggregatedTool = {
  name: "shop__list_products",
  description: "List products",
  inputSchema: { type: "object", properties: {} },
  upstreamId: "shop",
  upstreamName: "Test Shop",
  originalToolName: "list_products",
};

function makeHarness(
  callTool: () => Promise<unknown>,
  createAudit: (input: CreateAuditLogInput) => Promise<unknown> = async () => undefined,
) {
  const records: CreateAuditLogInput[] = [];

  const connection = {
    config: {
      id: "shop",
      name: "Test Shop",
      url: "http://127.0.0.1:9999/mcp",
      enabled: true,
    },
    client: {
      callTool: async () => callTool(),
    },
    transport: {},
  } as unknown as ConnectedUpstream;

  const auditRepository: AuditRepository = {
    create: async (input) => {
      records.push(input);
      await createAudit(input);
      return {
        id: "1",
        userId: input.userId ?? null,
        upstreamId: input.upstreamId ?? null,
        toolName: input.toolName,
        outcome: input.outcome,
        durationMs: input.durationMs ?? null,
        errorMessage: input.errorMessage ?? null,
        createdAt: new Date(),
      };
    },
    list: async () => [],
  };

  const app = buildApp({
    auditRepository,
    upstreamConnectionManager: {
      list: () => [connection],
      get: (id) => id === "shop" ? connection : undefined,
    },
    toolAggregator: {
      listTools: async () => [aggregatedTool],
    },
  });

  return { app, records };
}

async function callShopTool(app: ReturnType<typeof buildApp>) {
  return app.inject({
    method: "POST",
    url: "/mcp",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    payload: {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: aggregatedTool.name,
        arguments: {},
      },
    },
  });
}

test("successful aggregated tool calls are audited", async () => {
  const { app, records } = makeHarness(async () => ({
    content: [{ type: "text", text: "Two products found" }],
  }));

  try {
    const response = await callShopTool(app);

    assert.equal(response.statusCode, 200);
    assert.equal(records.length, 1);
    assert.equal(records[0]?.toolName, "shop__list_products");
    assert.equal(records[0]?.upstreamId, "shop");
    assert.equal(records[0]?.outcome, "success");
    assert.equal(records[0]?.userId, "test-user");
    assert.equal(typeof records[0]?.durationMs, "number");
    assert.equal(records[0]?.errorMessage, undefined);
  } finally {
    await app.close();
  }
});

test("upstream tool errors are audited as errors", async () => {
  const { app, records } = makeHarness(async () => ({
    content: [{ type: "text", text: "Upstream rejected request" }],
    isError: true,
  }));

  try {
    const response = await callShopTool(app);

    assert.equal(response.statusCode, 200);
    assert.equal(records.length, 1);
    assert.equal(records[0]?.outcome, "error");
    assert.equal(records[0]?.errorMessage, "Upstream tool returned isError=true.");
  } finally {
    await app.close();
  }
});

test("audit persistence failures do not break successful tool responses", async () => {
  const { app, records } = makeHarness(
    async () => ({ content: [{ type: "text", text: "ok" }] }),
    async () => {
      throw new Error("database unavailable");
    },
  );

  try {
    const response = await callShopTool(app);

    assert.equal(response.statusCode, 200);
    assert.equal(records.length, 1);
    assert.equal(records[0]?.outcome, "success");
    assert.match(response.body, /ok/);
  } finally {
    await app.close();
  }
});
