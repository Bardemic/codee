import type { Sandbox } from '@vercel/sandbox';
import { getGithubTokenForUser as getGithubToken } from '../../services/githubService';

export async function getGithubTokenForUser(userId: string): Promise<string | null> {
    try {
        return await getGithubToken(userId);
    } catch {
        return null;
    }
}

function generateRandomSuffix(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function cleanBranchName(title: string): string {
    return title
        .replace(/\s+/g, '-')
        .replace(/[^A-Za-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();
}

export function generateBranchName(params: { title: string; agentId: number }): string {
    const sanitized = cleanBranchName(params.title);
    const base = sanitized.length > 0 ? sanitized : `agent-${params.agentId}${generateRandomSuffix()}`;
    const suffix = generateRandomSuffix();
    return `codee/${base}-${suffix}`;
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
    await sandbox.runCommand({ cmd: 'git', args: ['push', '-u', 'origin', 'HEAD'] });
}
