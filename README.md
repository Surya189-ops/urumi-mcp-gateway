# Urumi MCP Gateway on Kubernetes

A team MCP gateway platform with WooCommerce as its first data source, built for the Urumi AI FDE Internship Round 1 assignment.

## Project status

Implementation has not started. This repository is being initialized from scratch.

## Goals

- Run WordPress and WooCommerce on Kubernetes with persistent storage.
- Build a custom WooCommerce MCP server using Streamable HTTP.
- Aggregate at least three upstream MCP servers through one gateway endpoint.
- Provide a React dashboard for server and team management.
- Authenticate team members with individually revocable API keys.
- Record tool calls in an audit log.
- Provide an AI chat agent that invokes tools through the gateway as the logged-in user.
- Deploy locally and to a production-like k3s environment using the same Helm charts and different values files.

## Architecture

1. **Store:** WordPress, WooCommerce, and a persistent database.
2. **WooCommerce MCP server:** Custom tools for products and orders; reachable only inside the cluster.
3. **Gateway and dashboard:** MCP tool aggregation, routing, authentication, server management, and auditing.
4. **Chat agent:** An LLM-backed interface that uses the gateway's tools.

## Security principles

- Keep credentials out of source control.
- Store Kubernetes workload credentials in Kubernetes Secrets.
- Store only hashes of team API keys.
- Never expose upstream credentials to browsers or MCP clients.
- Keep the WooCommerce MCP server internal to the cluster.
- Record tool calls with user identity, server, tool, timestamp, duration, and outcome.

## Development

The implementation plan, local setup instructions, production deployment instructions, tests, and demo procedure will be documented here as the project progresses.

## Assignment

Urumi AI FDE Internship — Round 1: MCP Gateway on Kubernetes.
