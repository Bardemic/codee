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

    const runCommandInputSchema = z.object({
        command: z
            .string()
            .describe(
                'Shell command to run. For dev servers, use: "npm run dev &> devserver.log & sleep 2; tail devserver.log" to run in background and verify startup.'
            ),
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
            await emitStatus(agentId, 'running', 'tool_list_files', (await result.stdout()).trim(), { arguments: input });
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
            await emitStatus(agentId, 'running', 'tool_read_file', content, { arguments: input });
            return content;
        },
    });

    const updateFile = tool({
        description: 'Overwrite a file with new content',
        inputSchema: zodSchema(updateFileInputSchema),
        execute: async (input) => {
            const { relativeFilePath, content } = input;
            await sandbox.writeFiles([{ path: relativeFilePath, content: Buffer.from(content) }]);
            await emitStatus(agentId, 'running', 'tool_update_file', `updated ${relativeFilePath}`, { arguments: input });
            return 'file updated';
        },
    });

    const runCommand = tool({
        description: 'Run a shell command in the sandbox',
        inputSchema: zodSchema(runCommandInputSchema),
        execute: async (input) => {
            const { command } = input;
            const result = await sandbox.runCommand({
                cmd: 'bash',
                args: ['-c', command],
            });
            await emitStatus(agentId, 'running', 'tool_run_command', await result.stdout(), { arguments: input });
            return result.stdout();
        },
    });

    return { listFiles, readFile, updateFile, runCommand };
}
