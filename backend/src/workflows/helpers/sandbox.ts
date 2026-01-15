import { Sandbox } from '@vercel/sandbox';

import { Agent } from '../../db/entities/Agent';
import { updateAgent } from './agents';

// Common ports for dev servers (Vercel Sandbox allows up to 4 ports)
export const DEFAULT_BROWSER_PORTS = [3000, 3001, 5173];

export async function createSandbox(
    agent: Agent,
    token: string,
    repositoryFullName: string,
    baseBranch: string,
    ports?: number[]
): Promise<Sandbox> {
    const sandbox = await Sandbox.create({
        token: process.env.VERCEL_TOKEN,
        teamId: process.env.VERCEL_TEAM_ID,
        projectId: process.env.VERCEL_PROJECT_ID,
        source: {
            type: 'git',
            url: `https://x-access-token:${token}@github.com/${repositoryFullName}.git`,
            depth: 1,
            revision: baseBranch,
        },
        runtime: process.env.VERCEL_RUNTIME || 'node22',
        timeout: 5 * 60 * 1000,
        resources: { vcpus: 2 },
        ports: ports || [],
    });

    await updateAgent(agent, { sandboxId: sandbox.sandboxId });

    return sandbox;
}
