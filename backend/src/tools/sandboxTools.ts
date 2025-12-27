import { z } from 'zod';
import { tool } from 'ai';
import type { Sandbox } from '@vercel/sandbox';
import { emitStatus } from '../stream/events';

async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString('utf-8');
}

export function sandboxTools(agentId: number, sandbox: Sandbox) {
    const listFiles = tool({
        description: 'List files in the repository',
        parameters: z.object({
            path: z.string().describe("Relative path to list (use '.' for repo root)"),
        }),
        execute: async ({ path }) => {
            const result = await sandbox.runCommand({
                cmd: 'bash',
                args: ['-c', `ls -1 ${path}`],
            });
            await emitStatus(agentId, 'running', 'tool_list_files', `listed ${path}`);
            return result.stdout();
        },
    });

    const readFile = tool({
        description: 'Read a file from the repository',
        parameters: z.object({
            path: z.string().describe('Relative file path to read'),
        }),
        execute: async ({ path }) => {
            const stream = await sandbox.readFile({ path });
            const content = stream ? await streamToString(stream) : '';
            await emitStatus(agentId, 'running', 'tool_read_file', `read ${path}`);
            return content;
        },
    });

    const updateFile = tool({
        description: 'Overwrite a file with new content',
        parameters: z.object({
            path: z.string().describe('Relative file path to write'),
            content: z.string().describe('New file contents'),
        }),
        execute: async ({ path, content }) => {
            await sandbox.writeFiles([{ path, content: Buffer.from(content) }]);
            await emitStatus(agentId, 'running', 'tool_update_file', `updated ${path}`);
            return 'file updated';
        },
    });

    const grep = tool({
        description: 'Run grep in the repository',
        parameters: z.object({
            command: z.string().describe('Shell command to run (e.g., `grep -R foo .`)'),
        }),
        execute: async ({ command }) => {
            const result = await sandbox.runCommand({
                cmd: 'bash',
                args: ['-c', command],
            });
            await emitStatus(agentId, 'running', 'tool_grep', command);
            return result.stdout();
        },
    });

    return { listFiles, readFile, updateFile, grep };
}
