import { Sandbox } from '@vercel/sandbox';

import { Agent } from '../../db/entities/Agent';
import { updateAgent } from './agents';

async function tryGetExistingSandbox(sandboxId: string | null): Promise<Sandbox | null> {
    if (!sandboxId) return null;

    try {
        const sandbox = await Sandbox.get({ sandboxId });
        if (sandbox.status === 'running') {
            return sandbox;
        }
        return null;
    } catch {
        return null;
    }
}

export async function createNewSandbox(token: string, repositoryFullName: string, branchName?: string): Promise<Sandbox> {
    const revision = branchName || undefined;

    return Sandbox.create({
        token: process.env.VERCEL_TOKEN,
        teamId: process.env.VERCEL_TEAM_ID,
        projectId: process.env.VERCEL_PROJECT_ID,
        source: {
            type: 'git',
            url: `https://x-access-token:${token}@github.com/${repositoryFullName}.git`,
            depth: 1,
            revision,
        },
        runtime: 'node24',
        timeout: 5 * 60 * 1000,
        resources: { vcpus: 2 },
    });
}

export async function getOrCreateSandbox(agent: Agent, token: string, repositoryFullName: string): Promise<{ sandbox: Sandbox; isNew: boolean }> {
    const existingSandbox = await tryGetExistingSandbox(agent.sandboxId);
    if (existingSandbox) {
        existingSandbox.extendTimeout(5000);
        return { sandbox: existingSandbox, isNew: false };
    }

    const sandbox = await createNewSandbox(token, repositoryFullName, agent.githubBranchName || undefined);

    await updateAgent(agent, { sandboxId: sandbox.sandboxId });

    return { sandbox, isNew: true };
}
