/**
 * Dynamic tools for MCP server
 * These tools are loaded based on workspace configuration
 * Includes PostHog analytics tools and GitHub tools
 */

import type { McpTool, McpToolResult, McpServerConfig } from "../../types";
import { formatErrorMessage, matchesToolSlug } from "../../utils";
import { AppDataSource } from "../../../db/data-source";
import { IntegrationConnection } from "../../../db/entities/IntegrationConnection";
import type { Sandbox } from "@vercel/sandbox";

/**
 * Get PostHog API key from database
 */
async function getPosthogApiKey(organizationId: string): Promise<string | null> {
  const connection = await AppDataSource.getRepository(IntegrationConnection).findOne({
    where: {
      organizationId: parseInt(organizationId),
      provider: { slug: "posthog" },
    },
    relations: ["provider"],
  });

  return connection?.getDataConfig()?.api_key || null;
}

/**
 * Build PostHog tools (simplified for now)
 * TODO: Integrate with @posthog/agent-toolkit when converting to MCP format
 */
async function buildPostHogTools(organizationId: string): Promise<McpTool[]> {
  const apiKey = await getPosthogApiKey(organizationId);
  if (!apiKey) return [];

  // For now, return a placeholder tool
  // In a full implementation, we would wrap the PostHog Agent Toolkit tools
  return [
    {
      name: "posthog_query",
      description: "Query PostHog analytics data (placeholder - to be implemented)",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "PostHog query to execute",
          },
        },
        required: ["query"],
      },
      execute: async (_input: { query: string }): Promise<McpToolResult> => {
        return {
          content: [
            {
              type: "text",
              text: "PostHog integration is not yet fully implemented in ACP mode. This is a placeholder.",
            },
          ],
        };
      },
    },
  ];
}

/**
 * Build GitHub commit tools
 */
function buildGitHubCommitTools(sandbox: Sandbox): McpTool[] {
  return [
    {
      name: "github_get_recent_commits",
      description: "Get recent commits from the repository",
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Number of commits to retrieve (default: 10)",
          },
        },
      },
      execute: async (input: { limit?: number }): Promise<McpToolResult> => {
        try {
          const limit = input.limit || 10;
          const result = await sandbox.runCommand({
            cmd: "bash",
            args: ["-c", `git log -n ${limit} --pretty=format:"%h - %an, %ar : %s"`],
          });

          const output = await result.stdout();

          return {
            content: [
              {
                type: "text",
                text: output || "No commits found",
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error fetching commits: ${formatErrorMessage(error)}`,
              },
            ],
            isError: true,
          };
        }
      },
    },
  ];
}

/**
 * Build dynamic tools based on enabled tool slugs
 */
export async function buildDynamicTools(
  config: McpServerConfig,
  sandbox: Sandbox
): Promise<McpTool[]> {
  const { enabledToolSlugs = [], organizationId } = config;
  const tools: McpTool[] = [];

  // Check if any PostHog tools are enabled
  const hasPostHogTools = enabledToolSlugs.some((slug) => slug.startsWith("posthog/"));
  if (hasPostHogTools) {
    const posthogTools = await buildPostHogTools(organizationId);
    tools.push(...posthogTools);
  }

  // Check if GitHub commit tools are enabled
  if (enabledToolSlugs.some((slug) => matchesToolSlug(slug, "github/commits"))) {
    const githubTools = buildGitHubCommitTools(sandbox);
    tools.push(...githubTools);
  }

  return tools;
}
