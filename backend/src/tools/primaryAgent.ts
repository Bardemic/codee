import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { CodeeProvider } from '../providers/codee';
import type { Workspace } from '../db/entities/Workspace';
import type { MessageImage } from '../db/entities/Message';
import { emitStatus } from '../stream/events';

interface OrchestratorAgentToolsParams {
    agentId: number;
    organizationId: number;
    workspace: Workspace;
    repositoryFullName: string;
    baseBranch: string;
    toolSlugs: string[];
    images: MessageImage[];
}

export function buildOrchestratorAgentTools({
    agentId,
    organizationId,
    workspace,
    repositoryFullName,
    baseBranch,
    toolSlugs,
    images,
}: OrchestratorAgentToolsParams) {
    const spawnSubAgentInputSchema = z.object({
        prompt: z.string().describe('The prompt to spawn the agent with'),
    });

    return {
        spawn_sub_agent: tool({
            description: 'Spawn a new agent with a given prompt',
            inputSchema: zodSchema(spawnSubAgentInputSchema),
            execute: async (input) => {
                const { prompt } = input;
                const agent = await new CodeeProvider().createAgent({
                    organizationId,
                    workspace,
                    repositoryFullName,
                    message: prompt,
                    toolSlugs,
                    baseBranch,
                    isOrchestratorAgent: false,
                    images,
                });

                if (agent.id) await emitStatus(agentId, 'running', 'tool_spawn_sub_agent', String(agent.id), { arguments: input });
                else await emitStatus(agentId, 'error', 'tool_spawn_sub_agent', 'Failed to spawn agent', { arguments: input });

                return agent.id;
            },
        }),
    };
}
