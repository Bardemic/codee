import { z } from 'zod';
import { tool } from 'ai';
import type { Sandbox } from '@vercel/sandbox';

export function buildCommitTools(sandbox: Sandbox) {
    return {
        github_list_commits: tool({
            description: 'List recent git commits in the repository (max 10). Do NOT do anything regarding Git without using this tool.',
            parameters: z.object({
                n: z.number().min(1).max(10).default(5).describe('Number of commits to list'),
            }),
            execute: async ({ n }) => {
                const result = await sandbox.runCommand({
                    cmd: 'bash',
                    args: ['-c', `git log -n ${n} --pretty=format:'%H - %an, %ad : %s' --date=iso`],
                });
                return result.stdout();
            },
        }),

        github_view_commit: tool({
            description: 'Show detailed diff for a specific commit',
            parameters: z.object({
                sha: z.string().describe('The commit SHA to view'),
            }),
            execute: async ({ sha }) => {
                const result = await sandbox.runCommand({
                    cmd: 'bash',
                    args: ['-c', `git show ${sha}`],
                });
                return result.stdout();
            },
        }),
    };
}
