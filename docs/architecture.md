# System Architecture

## 1. Overview

The platform consists of four main layers:

1. Store: WordPress and WooCommerce backed by persistent database storage.
2. WooCommerce MCP server: A custom MCP server exposing product and order operations.
3. Gateway and dashboard: A backend that connects to registered MCP servers, aggregates their tools, authenticates team members, routes calls, and records audit events. A React dashboard provides administration and team access.
4. Chat agent: An LLM-backed interface that invokes tools through the gateway as the authenticated user.

## 2. Request flow

### External MCP client

1. The client connects to the gateway MCP endpoint using the user's gateway API key.
2. The gateway authenticates the key and resolves the user and role.
3. The gateway discovers tools from enabled upstream MCP servers.
4. The gateway routes each tool call to its owning upstream server.
5. The gateway records the outcome, duration, user, server, and tool.
6. The gateway returns the result to the client.

### Dashboard chat

1. The logged-in user submits a question.
2. The chat agent obtains the tools available through the gateway.
3. The LLM selects tools and supplies arguments.
4. Tool calls pass through the gateway under the logged-in user's identity.
5. Results return to the LLM, which produces the final answer.
6. The interface displays the answer and the tools used.

## 3. Network boundaries

- The storefront and dashboard are exposed through Kubernetes Ingress.
- The gateway MCP endpoint is exposed through the gateway service and Ingress.
- The WooCommerce MCP server is internal to the cluster and is callable only by the gateway.
- Upstream MCP credentials remain on the server side.
- The WooCommerce database is not exposed publicly.

## 4. Tool naming and routing

The gateway must handle identical tool names from different upstream servers. The implementation will use a documented, deterministic namespacing scheme that identifies the upstream server and tool. The gateway will retain an explicit mapping from each public tool name to its upstream server and original tool name.

## 5. Failure handling

- Each upstream call has a bounded timeout.
- An unreachable upstream is marked unhealthy without preventing discovery or calls to healthy upstreams.
- Tool listing omits disabled upstreams and their tools.
- Tool failures return clear errors and are recorded in the audit log.

## 6. Identity and credentials

- Each team member has an individually revocable gateway API key.
- Only a cryptographic hash of each API key is stored.
- Upstream credentials are stored server-side and never returned to browsers or MCP clients.
- Chat tool calls use the authenticated user's identity.
- Authorization is enforced by the gateway, not only by the user interface.

## 7. Kubernetes and Helm

All application components and the store run inside Kubernetes. Helm is the deployment mechanism for both local Kubernetes and production-like k3s.

Environment differences are supplied through values files, including domain names, Ingress settings, storage configuration, and resource sizing. Credentials are supplied through Kubernetes Secrets rather than committed source files.

## 8. Implementation status

This document describes the intended architecture. Each behavior must be verified by implementation and tests before it is considered complete.
