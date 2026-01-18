/**
 * Orchestrator tools for MCP server
 * These tools enable multi-agent orchestration by spawning sub-agents
 */

import type { McpTool, McpToolResult } from "../../types";
import { formatErrorMessage } from "../../utils";
import { CodeeProvider } from "../../../providers/codee";
import type { Workspace } from "../../../db/entities/Workspace";
import type { MessageImage } from "../../../db/entities/Message";

/**
 * Build orchestrator tools for multi-agent workflows
 */
export function buildOrchestratorTools(opts: {
  agentId: string;
  organizationId: string;
  workspace: Workspace;
  repositoryFullName: string;
  baseBranch: string;
  toolSlugs: string[];
  images?: MessageImage[];
}): McpTool[] {
  const {
    organizationId,
    workspace,
    repositoryFullName,
    baseBranch,
    toolSlugs,
    images = [],
  } = opts;

  return [
    {
      name: "spawn_sub_agent",
      description:
        "Spawn a new sub-agent to work on a specific task. The sub-agent will have access to the same repository and tools.",
      inputSchema: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "The prompt/task for the sub-agent to work on",
          },
        },
        required: ["prompt"],
      },
      execute: async (input: { prompt: string }): Promise<McpToolResult> => {
        try {
          const { prompt } = input;

          // Create new agent via CodeeProvider
          const agent = await new CodeeProvider().createAgent({
            organizationId: parseInt(organizationId),
            workspace,
            repositoryFullName,
            message: prompt,
            toolSlugs,
            baseBranch,
            isOrchestratorAgent: false,
            images,
          });

          if (!agent.id) {
            return {
              content: [
                {
                  type: "text",
                  text: "Failed to spawn sub-agent",
                },
              ],
              isError: true,
            };
          }

          return {
            content: [
              {
                type: "text",
                text: `Successfully spawned sub-agent with ID: ${agent.id}. The sub-agent will work on: ${prompt}`,
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error spawning sub-agent: ${formatErrorMessage(error)}`,
              },
            ],
            isError: true,
          };
        }
      },
    },
  ];
}
