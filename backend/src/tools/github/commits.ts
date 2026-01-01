import { z } from 'zod';
import { tool, zodSchema } from 'ai';
import type { Sandbox } from '@vercel/sandbox';

export function buildCommitTools(sandbox: Sandbox) {
    const listCommitsInputSchema = z.object({
        commitLimit: z.number().min(1).max(10).default(5).describe('Number of commits to list'),
    });

    const viewCommitInputSchema = z.object({
        commitSha: z.string().describe('The commit SHA to view'),
    });

    return {
        github_list_commits: tool({
            description: 'List recent git commits in the repository (max 10). Do NOT do anything regarding Git without using this tool.',
            inputSchema: zodSchema(listCommitsInputSchema),
            execute: async (input) => {
                const { commitLimit } = input;
                const result = await sandbox.runCommand({
                    cmd: 'bash',
                    args: ['-c', `git log -n ${commitLimit} --pretty=format:'%H - %an, %ad : %s' --date=iso`],
                });
                return result.stdout();
            },
        }),

        github_view_commit: tool({
            description: 'Show detailed diff for a specific commit',
            inputSchema: zodSchema(viewCommitInputSchema),
            execute: async (input) => {
                const { commitSha } = input;
                const result = await sandbox.runCommand({
                    cmd: 'bash',
                    args: ['-c', `git show ${commitSha}`],
                });
                return result.stdout();
            },
        }),
    };
}
