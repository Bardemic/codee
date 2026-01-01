import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import { CodeeProvider } from '../providers/codee';
import type { Workspace } from '../db/entities/Workspace';

interface OrchestratorAgentToolsParams {
    userId: string;
    workspace: Workspace;
    repositoryFullName: string;
    baseBranch: string;
    toolSlugs: string[];
}

export function buildOrchestratorAgentTools({ userId, workspace, repositoryFullName, baseBranch, toolSlugs }: OrchestratorAgentToolsParams) {
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
                    userId,
                    workspace,
                    repositoryFullName,
                    message: prompt,
                    toolSlugs,
                    baseBranch,
                    isOrchestratorAgent: false,
                });
                return agent.id;
            },
        }),
    };
}
