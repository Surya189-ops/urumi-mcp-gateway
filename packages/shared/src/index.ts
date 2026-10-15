/**
 * Shared types and utilities for the Urumi MCP Gateway platform.
 *
 * Keep cross-application contracts here so the dashboard, gateway,
 * and MCP servers use consistent data structures.
 */

export type HealthStatus = "connected" | "unreachable" | "disabled";

export type UserRole = "admin" | "member";

export type AuditOutcome = "success" | "error";
