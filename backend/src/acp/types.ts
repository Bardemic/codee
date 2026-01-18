/**
 * Type definitions for ACP integration
 */

import type { Sandbox } from "@vercel/sandbox";
import type { Agent, Workspace, Organization } from "../db/entities";

/**
 * Configuration for creating an MCP server instance
 */
export interface McpServerConfig {
  sandboxId: string;
  workspaceId: string;
  organizationId: string;
  agentId: string;
  vercelToken: string;
  vercelTeamId: string;
  vercelProjectId: string;
  enabledToolSlugs?: string[];
  hasBrowserAccess?: boolean;
}

/**
 * MCP Tool definition
 */
export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
  execute: (input: any) => Promise<McpToolResult>;
}

/**
 * Result from MCP tool execution
 */
export interface McpToolResult {
  content: McpToolContent[];
  isError?: boolean;
}

/**
 * Content block in MCP tool result (text or image)
 */
export type McpToolContent =
  | {
      type: "text";
      text: string;
    }
  | {
      type: "image";
      data: string; // base64
      mimeType: string;
    };

/**
 * ACP session configuration
 */
export interface AcpSessionConfig {
  sandbox: Sandbox;
  workspace: Workspace;
  organization: Organization;
  agent: Agent;
  enabledToolSlugs: string[];
}

/**
 * ACP notification types mapped to our SSE events
 */
export type AcpNotificationType =
  | "tool_call"
  | "tool_update"
  | "message"
  | "reasoning"
  | "status"
  | "error";

/**
 * Structured notification for frontend SSE
 */
export interface AcpNotification {
  type: AcpNotificationType;
  agentId: string;
  data: any;
}
