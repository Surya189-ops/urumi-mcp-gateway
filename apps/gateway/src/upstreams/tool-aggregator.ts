import type { ConnectedUpstream } from "./connection-manager.js";

export interface AggregatedTool {
  name: string;
  description?: string;
  inputSchema: {
    type: "object";
    properties?: Record<string, object>;
    required?: string[];
    [key: string]: unknown;
  };
  upstreamId: string;
  upstreamName: string;
  originalToolName: string;
}

export class ToolAggregator {
  async listTools(
    connections: ConnectedUpstream[],
  ): Promise<AggregatedTool[]> {
    const results = await Promise.allSettled(
      connections.map(async (connection) => {
        const response = await connection.client.listTools(
          {},
          { timeout: 5000 },
        );

        return response.tools.map((tool) => ({
          name: `${connection.config.id}__${tool.name}`,
          description: tool.description,
          inputSchema: tool.inputSchema,
          upstreamId: connection.config.id,
          upstreamName: connection.config.name,
          originalToolName: tool.name,
        }));
      }),
    );

    return results.flatMap((result) =>
      result.status === "fulfilled" ? result.value : [],
    );
  }
}
