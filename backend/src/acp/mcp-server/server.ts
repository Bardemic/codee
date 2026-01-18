/**
 * MCP Server implementation for Codee
 * This server exposes all Codee tools (sandbox, browser, dynamic, orchestrator) via the MCP protocol
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { McpTool, McpServerConfig } from "../types";
import { buildSandboxTools } from "./tools/sandbox";
import { buildBrowserTools } from "./tools/browser";
import { buildDynamicTools } from "./tools/dynamic";
import { buildOrchestratorTools } from "./tools/orchestrator";
import type { Sandbox } from "@vercel/sandbox";
import { AppDataSource } from "../../db/data-source";
import { Agent } from "../../db/entities/Agent";
import { Workspace } from "../../db/entities/Workspace";

/**
 * Codee MCP Server
 */
export class CodeeMcpServer {
  private server: Server;
  private tools: Map<string, McpTool> = new Map();
  private config: McpServerConfig;
  private sandbox: Sandbox | null = null;

  constructor(config: McpServerConfig) {
    this.config = config;

    this.server = new Server(
      {
        name: "codee-mcp-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  /**
   * Initialize the server and load tools
   */
  async initialize(): Promise<void> {
    // Get sandbox instance
    this.sandbox = await this.getSandbox();

    // Load all tools
    await this.loadTools();

    console.error(`[MCP Server] Initialized with ${this.tools.size} tools`);
  }

  /**
   * Get sandbox instance from Vercel
   */
  private async getSandbox(): Promise<Sandbox> {
    // Import Vercel Sandbox SDK
    const { Sandbox: VercelSandbox } = await import("@vercel/sandbox");

    // Create sandbox connection using the provided ID
    // Note: The sandbox should already be created by the workflow
    const sandbox = await VercelSandbox.connectToSandbox({
      id: this.config.sandboxId,
      token: this.config.vercelToken,
      teamId: this.config.vercelTeamId,
    });

    return sandbox;
  }

  /**
   * Load all tools based on configuration
   */
  private async loadTools(): Promise<void> {
    if (!this.sandbox) {
      throw new Error("Sandbox not initialized");
    }

    const tools: McpTool[] = [];

    // Always load sandbox tools
    const sandboxTools = buildSandboxTools(this.sandbox);
    tools.push(...sandboxTools);
    console.error(`[MCP Server] Loaded ${sandboxTools.length} sandbox tools`);

    // Load browser tools if enabled
    if (this.config.hasBrowserAccess) {
      const kernelApiKey = process.env.KERNEL_API_KEY;
      if (kernelApiKey) {
        const browserTools = buildBrowserTools({
          agentId: this.config.agentId,
          apiKey: kernelApiKey,
          sandboxUrls: [], // TODO: Pass sandbox URLs if available
        });
        tools.push(...browserTools);
        console.error(`[MCP Server] Loaded ${browserTools.length} browser tools`);
      }
    }

    // Load dynamic tools (PostHog, GitHub, etc.)
    const dynamicTools = await buildDynamicTools(this.config, this.sandbox);
    tools.push(...dynamicTools);
    console.error(`[MCP Server] Loaded ${dynamicTools.length} dynamic tools`);

    // Load orchestrator tools (for multi-agent workflows)
    const agent = await AppDataSource.getRepository(Agent).findOne({
      where: { id: parseInt(this.config.agentId) },
      relations: ["workspace"],
    });

    if (agent) {
      const workspace = await AppDataSource.getRepository(Workspace).findOne({
        where: { id: agent.workspace.id },
      });

      if (workspace) {
        const orchestratorTools = buildOrchestratorTools({
          agentId: this.config.agentId,
          organizationId: this.config.organizationId,
          workspace,
          repositoryFullName: workspace.repositoryFullName,
          baseBranch: workspace.baseBranch,
          toolSlugs: this.config.enabledToolSlugs || [],
        });
        tools.push(...orchestratorTools);
        console.error(`[MCP Server] Loaded ${orchestratorTools.length} orchestrator tools`);
      }
    }

    // Register all tools
    for (const tool of tools) {
      this.tools.set(tool.name, tool);
    }
  }

  /**
   * Setup MCP request handlers
   */
  private setupHandlers(): void {
    // Handle tool listing
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: Array.from(this.tools.values()).map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      };
    });

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const tool = this.tools.get(request.params.name);

      if (!tool) {
        return {
          content: [
            {
              type: "text",
              text: `Tool not found: ${request.params.name}`,
            },
          ],
          isError: true,
        };
      }

      try {
        const result = await tool.execute(request.params.arguments || {});

        return {
          content: result.content.map((c) => {
            if (c.type === "text") {
              return {
                type: "text" as const,
                text: c.text,
              };
            } else if (c.type === "image") {
              return {
                type: "resource" as const,
                resource: {
                  uri: `data:${c.mimeType};base64,${c.data}`,
                  mimeType: c.mimeType,
                  text: "Image",
                },
              };
            }
            return {
              type: "text" as const,
              text: String(c),
            };
          }),
          isError: result.isError,
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error executing tool: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("[MCP Server] Started and listening on stdio");
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    if (this.sandbox) {
      // Don't stop the sandbox here - it's managed by the workflow
      this.sandbox = null;
    }
    console.error("[MCP Server] Cleaned up");
  }
}
