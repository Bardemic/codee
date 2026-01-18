/**
 * ACP Client Wrapper
 * Manages Claude Code ACP agent lifecycle and communication
 */

import { spawn, type ChildProcess } from "child_process";
import { EventEmitter } from "events";
import type { AcpSessionConfig } from "./types";
import { handleAcpNotification } from "./notifications";
import * as path from "path";
import type { Sandbox } from "@vercel/sandbox";

/**
 * ACP Client for managing Claude Code agent
 */
export class AcpClient extends EventEmitter {
  private claudeCodeProcess: ChildProcess | null = null;
  private mcpServerProcess: ChildProcess | null = null;
  private sessionId: string | null = null;
  private agentId: number;

  constructor(agentId: number) {
    super();
    this.agentId = agentId;
  }

  /**
   * Initialize and start the ACP client
   */
  async initialize(config: AcpSessionConfig): Promise<string> {
    const { sandbox, workspace, organization, agent, enabledToolSlugs } = config;

    // Start MCP server process
    await this.startMcpServer(sandbox, workspace, organization, agent, enabledToolSlugs);

    // Start Claude Code ACP process
    await this.startClaudeCode();

    // Create session
    this.sessionId = await this.createSession(sandbox);

    return this.sessionId;
  }

  /**
   * Start the MCP server process
   */
  private async startMcpServer(
    sandbox: Sandbox,
    workspace: any,
    organization: any,
    agent: any,
    enabledToolSlugs: string[]
  ): Promise<void> {
    const mcpServerPath = path.join(__dirname, "mcp-server/index.ts");

    // Check if browser access is enabled (based on organization tier)
    const hasBrowserAccess = organization.tier !== "FREE";

    this.mcpServerProcess = spawn(
      "tsx",
      [mcpServerPath],
      {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          SANDBOX_ID: sandbox.id,
          WORKSPACE_ID: String(workspace.id),
          ORGANIZATION_ID: String(organization.id),
          AGENT_ID: String(agent.id),
          VERCEL_TOKEN: process.env.VERCEL_TOKEN!,
          VERCEL_TEAM_ID: process.env.VERCEL_TEAM_ID!,
          VERCEL_PROJECT_ID: process.env.VERCEL_PROJECT_ID!,
          ENABLED_TOOL_SLUGS: JSON.stringify(enabledToolSlugs),
          HAS_BROWSER_ACCESS: String(hasBrowserAccess),
        },
      }
    );

    // Log MCP server output
    this.mcpServerProcess.stderr?.on("data", (data) => {
      console.error(`[MCP Server] ${data.toString()}`);
    });

    this.mcpServerProcess.on("error", (error) => {
      console.error("[MCP Server] Process error:", error);
      this.emit("error", error);
    });

    this.mcpServerProcess.on("exit", (code) => {
      console.error(`[MCP Server] Process exited with code ${code}`);
    });

    // Wait a bit for the MCP server to start
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  /**
   * Start the Claude Code ACP process
   */
  private async startClaudeCode(): Promise<void> {
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicApiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable is not set");
    }

    this.claudeCodeProcess = spawn(
      "npx",
      ["@zed-industries/claude-code-acp"],
      {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          ANTHROPIC_API_KEY: anthropicApiKey,
        },
      }
    );

    // Log Claude Code output
    this.claudeCodeProcess.stderr?.on("data", (data) => {
      console.error(`[Claude Code] ${data.toString()}`);
    });

    this.claudeCodeProcess.on("error", (error) => {
      console.error("[Claude Code] Process error:", error);
      this.emit("error", error);
    });

    this.claudeCodeProcess.on("exit", (code) => {
      console.error(`[Claude Code] Process exited with code ${code}`);
    });

    // Wait for Claude Code to start
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  /**
   * Create a new ACP session
   */
  private async createSession(sandbox: Sandbox): Promise<string> {
    // For now, we'll use a simpler approach:
    // The claude-code-acp process communicates over stdio
    // We need to implement the JSON-RPC protocol

    // This is a simplified implementation - in production, we'd use the ACP SDK client
    // For now, we'll just return a mock session ID
    const sessionId = `session-${Date.now()}`;

    console.log("[ACP Client] Created session:", sessionId);

    return sessionId;
  }

  /**
   * Send a message to the agent
   */
  async sendMessage(content: string, images?: string[]): Promise<void> {
    if (!this.sessionId) {
      throw new Error("Session not initialized");
    }

    // This would send a JSON-RPC message to the Claude Code process
    // For now, this is a placeholder
    console.log("[ACP Client] Sending message:", content.slice(0, 100));

    // In a real implementation, we'd:
    // 1. Format the message as a JSON-RPC request
    // 2. Send it to claudeCodeProcess.stdin
    // 3. Listen for responses on claudeCodeProcess.stdout
    // 4. Parse and handle notifications
  }

  /**
   * Handle notification from ACP
   */
  private async handleNotification(notification: any): Promise<void> {
    try {
      await handleAcpNotification(notification, this.agentId);
    } catch (error) {
      console.error("[ACP Client] Error handling notification:", error);
      this.emit("error", error);
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    console.log("[ACP Client] Cleaning up...");

    if (this.mcpServerProcess) {
      this.mcpServerProcess.kill("SIGTERM");
      this.mcpServerProcess = null;
    }

    if (this.claudeCodeProcess) {
      this.claudeCodeProcess.kill("SIGTERM");
      this.claudeCodeProcess = null;
    }

    this.sessionId = null;

    console.log("[ACP Client] Cleanup complete");
  }
}
