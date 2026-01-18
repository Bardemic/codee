#!/usr/bin/env node
/**
 * MCP Server Entry Point
 * This script is executed as a separate Node process by the ACP client
 * Configuration is passed via environment variables
 */

import { CodeeMcpServer } from "./server";
import type { McpServerConfig } from "../types";
import { AppDataSource } from "../../db/data-source";

/**
 * Main entry point
 */
async function main() {
  try {
    // Get configuration from environment variables
    const config: McpServerConfig = {
      sandboxId: process.env.SANDBOX_ID!,
      workspaceId: process.env.WORKSPACE_ID!,
      organizationId: process.env.ORGANIZATION_ID!,
      agentId: process.env.AGENT_ID!,
      vercelToken: process.env.VERCEL_TOKEN!,
      vercelTeamId: process.env.VERCEL_TEAM_ID!,
      vercelProjectId: process.env.VERCEL_PROJECT_ID!,
      enabledToolSlugs: process.env.ENABLED_TOOL_SLUGS
        ? JSON.parse(process.env.ENABLED_TOOL_SLUGS)
        : [],
      hasBrowserAccess: process.env.HAS_BROWSER_ACCESS === "true",
    };

    // Validate required environment variables
    const required = [
      "SANDBOX_ID",
      "WORKSPACE_ID",
      "ORGANIZATION_ID",
      "AGENT_ID",
      "VERCEL_TOKEN",
      "VERCEL_TEAM_ID",
      "VERCEL_PROJECT_ID",
    ];

    for (const key of required) {
      if (!process.env[key]) {
        console.error(`[MCP Server] Error: Missing required environment variable: ${key}`);
        process.exit(1);
      }
    }

    // Initialize database connection
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
      console.error("[MCP Server] Database connection initialized");
    }

    // Create and start MCP server
    const server = new CodeeMcpServer(config);
    await server.initialize();
    await server.start();

    // Handle graceful shutdown
    const cleanup = async () => {
      console.error("[MCP Server] Shutting down...");
      await server.cleanup();
      if (AppDataSource.isInitialized) {
        await AppDataSource.destroy();
      }
      process.exit(0);
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
  } catch (error) {
    console.error("[MCP Server] Fatal error:", error);
    process.exit(1);
  }
}

// Run the server
main().catch((error) => {
  console.error("[MCP Server] Unhandled error:", error);
  process.exit(1);
});
