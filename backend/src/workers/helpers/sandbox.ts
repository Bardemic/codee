import { Sandbox } from '@vercel/sandbox';

import { Agent } from '../../db/entities/Agent';
import { updateAgent } from './agents';

export async function createSandbox(agent: Agent, token: string, repositoryFullName: string, baseBranch?: string): Promise<Sandbox> {
    const revision = agent.githubBranchName || baseBranch || undefined;

    const sandbox = await Sandbox.create({
        token: process.env.VERCEL_TOKEN,
        teamId: process.env.VERCEL_TEAM_ID,
        projectId: process.env.VERCEL_PROJECT_ID,
        source: {
            type: 'git',
            url: `https://x-access-token:${token}@github.com/${repositoryFullName}.git`,
            depth: 1,
            revision,
        },
        runtime: process.env.VERCEL_RUNTIME || 'node22',
        timeout: 5 * 60 * 1000,
        resources: { vcpus: 2 },
    });

    await updateAgent(agent, { sandboxId: sandbox.sandboxId });

    return sandbox;
}
