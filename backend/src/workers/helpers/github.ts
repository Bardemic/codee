import type { Sandbox } from '@vercel/sandbox';
import { getGithubTokenForUser as getGithubToken } from '../../services/githubService';

export async function getGithubTokenForUser(userId: string): Promise<string | null> {
    try {
        return await getGithubToken(userId);
    } catch {
        return null;
    }
}

export function generateBranchName(agentId: number): string {
    const timestamp = Date.now();
    return `codee/agent-${agentId}-${timestamp}`;
}

export async function commitAndPush(sandbox: Sandbox, message: string): Promise<void> {
    await sandbox.runCommand({ cmd: 'git', args: ['add', '-A'] });
    await sandbox.runCommand({
        cmd: 'git',
        args: ['commit', '-m', message],
        env: {
            GIT_AUTHOR_NAME: 'Codee Agent',
            GIT_AUTHOR_EMAIL: 'agent@codee.dev',
            GIT_COMMITTER_NAME: 'Codee Agent',
            GIT_COMMITTER_EMAIL: 'agent@codee.dev',
        },
    });
    await sandbox.runCommand({ cmd: 'git', args: ['push'] });
}
