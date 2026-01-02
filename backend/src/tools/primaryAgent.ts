import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { CodeeProvider } from '../providers/codee';
import type { Workspace } from '../db/entities/Workspace';
import { emitStatus } from '../stream/events';

interface OrchestratorAgentToolsParams {
    agentId: number;
    userId: string;
    workspace: Workspace;
    repositoryFullName: string;
    baseBranch: string;
    toolSlugs: string[];
}

export function buildOrchestratorAgentTools({ agentId, userId, workspace, repositoryFullName, baseBranch, toolSlugs }: OrchestratorAgentToolsParams) {
    const spawnSubAgentInputSchema = z.object({
        prompt: z.string().describe('The prompt to spawn the agent with'),
    });

    return {
        spawn_sub_agent: tool({
            description: 'Spawn a new agent with a given prompt',
            inputSchema: zodSchema(spawnSubAgentInputSchema),
            execute: async (input) => {
                const { prompt } = input;
                // Emit status before creating agent to show it's happening
                await emitStatus(agentId, 'running', 'tool_spawn_sub_agent', `Spawning agent with prompt: ${prompt}`, { arguments: input });

                const agent = await new CodeeProvider().createAgent({
                    userId,
                    workspace,
                    repositoryFullName,
                    message: prompt,
                    toolSlugs,
                    baseBranch,
                    isOrchestratorAgent: false,
                });

                // Update status with result
                await emitStatus(agentId, 'running', 'tool_spawn_sub_agent', String(agent.id), { arguments: input });

                return agent.id;
            },
        }),
    };
}
