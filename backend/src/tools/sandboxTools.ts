import { z } from 'zod';
import { tool, zodSchema } from 'ai';
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
    const listFilesInputSchema = z.object({
        relativePath: z.string().describe("Relative path to list (use '.' for repo root)"),
    });

    const readFileInputSchema = z.object({
        relativeFilePath: z.string().describe('Relative file path to read'),
    });

    const updateFileInputSchema = z.object({
        relativeFilePath: z.string().describe('Relative file path to write'),
        content: z.string().describe('New file contents'),
    });

    const grepInputSchema = z.object({
        command: z.string().describe('Shell command to run (e.g., `grep -R foo .`)'),
    });

    const listFiles = tool({
        description: 'List files in the repository',
        inputSchema: zodSchema(listFilesInputSchema),
        execute: async (input) => {
            const { relativePath } = input;
            const result = await sandbox.runCommand({
                cmd: 'bash',
                args: ['-c', `ls -1 ${relativePath}`],
            });
            await emitStatus(agentId, 'running', 'tool_list_files', `listed ${relativePath}`);
            return result.stdout();
        },
    });

    const readFile = tool({
        description: 'Read a file from the repository',
        inputSchema: zodSchema(readFileInputSchema),
        execute: async (input) => {
            const { relativeFilePath } = input;
            const stream = await sandbox.readFile({ path: relativeFilePath });
            const content = stream ? await streamToString(stream) : '';
            await emitStatus(agentId, 'running', 'tool_read_file', `read ${relativeFilePath}`);
            return content;
        },
    });

    const updateFile = tool({
        description: 'Overwrite a file with new content',
        inputSchema: zodSchema(updateFileInputSchema),
        execute: async (input) => {
            const { relativeFilePath, content } = input;
            await sandbox.writeFiles([{ path: relativeFilePath, content: Buffer.from(content) }]);
            await emitStatus(agentId, 'running', 'tool_update_file', `updated ${relativeFilePath}`);
            return 'file updated';
        },
    });

    const grep = tool({
        description: 'Run grep in the repository',
        inputSchema: zodSchema(grepInputSchema),
        execute: async (input) => {
            const { command } = input;
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
