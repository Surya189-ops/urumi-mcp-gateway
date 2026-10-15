import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { UpstreamServerConfig } from "./types.js";

export interface ConnectedUpstream {
  config: UpstreamServerConfig;
  client: Client;
  transport: StreamableHTTPClientTransport;
}

export class UpstreamConnectionManager {
  private readonly connections = new Map<string, ConnectedUpstream>();

  async connect(config: UpstreamServerConfig): Promise<ConnectedUpstream> {
    if (!config.enabled) {
      throw new Error(`Upstream server "${config.id}" is disabled.`);
    }

    if (this.connections.has(config.id)) {
      throw new Error(`Upstream server "${config.id}" is already connected.`);
    }

    const client = new Client({
      name: "urumi-gateway",
      version: "1.0.0",
    });

    const transport = new StreamableHTTPClientTransport(
      new URL(config.url),
    );

    try {
      await client.connect(transport, { timeout: 5000 });

      const connection: ConnectedUpstream = {
        config: { ...config },
        client,
        transport,
      };

      this.connections.set(config.id, connection);
      return connection;
    } catch (error) {
      await transport.close().catch(() => undefined);
      await client.close().catch(() => undefined);
      throw error;
    }
  }

  get(id: string): ConnectedUpstream | undefined {
    return this.connections.get(id);
  }

  list(): ConnectedUpstream[] {
    return Array.from(this.connections.values());
  }

  async disconnect(id: string): Promise<boolean> {
    const connection = this.connections.get(id);

    if (!connection) {
      return false;
    }

    this.connections.delete(id);

    const results = await Promise.allSettled([
      connection.client.close(),
      connection.transport.close(),
    ]);

    const failures = results.filter(
      (result) => result.status === "rejected",
    );

    if (failures.length > 0) {
      throw new Error(
        `Failed to fully close upstream server "${id}" (${failures.length} cleanup operation(s) failed).`,
      );
    }

    return true;
  }

  async disconnectAll(): Promise<void> {
    const results = await Promise.allSettled(
      Array.from(this.connections.keys(), (id) => this.disconnect(id)),
    );

    const failures = results.filter((result) => result.status === "rejected");

    if (failures.length > 0) {
      throw new Error(
        `Failed to close ${failures.length} upstream connection(s).`,
      );
    }
  }
}
