import { UpstreamConnectionManager } from "./connection-manager.js";
import { UpstreamRegistry } from "./registry.js";
import { ToolAggregator } from "./tool-aggregator.js";

export const upstreamRegistry = new UpstreamRegistry();
export const upstreamConnections = new UpstreamConnectionManager();
export const toolAggregator = new ToolAggregator();
