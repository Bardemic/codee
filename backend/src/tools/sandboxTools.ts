import { z } from 'zod';
import { tool, zodSchema } from 'ai';
import type { Sandbox } from '@vercel/sandbox';
import { emitStatus } from '../stream/events';

const COMMAND_TIMEOUT_MS = 30 * 1000; // 30 seconds
const MAX_OUTPUT_LINES = 200;
const DEFAULT_FILE_LINES = 200;

function truncateOutput(output: string): string {
    const lines = output.split('\n');
    const totalLines = lines.length;

    if (totalLines <= MAX_OUTPUT_LINES) {
        return output;
    }

    const truncated = lines.slice(0, MAX_OUTPUT_LINES).join('\n');
    return `${truncated}\n\n...[showing ${MAX_OUTPUT_LINES} of ${totalLines} lines]`;
}

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
        startLine: z.number().optional().default(1).describe('Line to start from (1-indexed)'),
        limit: z.number().optional().default(DEFAULT_FILE_LINES).describe('Max lines to return'),
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
        description: 'Read a file from the repository. Returns paginated content - use startLine and limit for large files.',
        inputSchema: zodSchema(readFileInputSchema),
        execute: async (input) => {
            const { relativeFilePath, startLine, limit } = input;
            const stream = await sandbox.readFile({ path: relativeFilePath });
            const fullContent = stream ? await streamToString(stream) : '';
            const lines = fullContent.split('\n');
            const totalLines = lines.length;

            const slice = lines.slice(startLine - 1, startLine - 1 + limit);
            const endLine = Math.min(startLine + slice.length - 1, totalLines);
            const hasMore = startLine + limit <= totalLines;

            // Add line numbers to each line
            const numberedContent = slice.map((line, i) => `${startLine + i}: ${line}`).join('\n');

            let result: string;
            if (hasMore) {
                result = `${numberedContent}\n\n...[showing lines ${startLine}-${endLine} of ${totalLines}]`;
            } else {
                result = numberedContent;
            }

            await emitStatus(agentId, 'running', 'tool_read_file', result, { arguments: input });
            return result;
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
        description: 'Run a shell command in the sandbox. Output is truncated to 200 lines - use head/tail or redirect to file for full output.',
        inputSchema: zodSchema(runCommandInputSchema),
        execute: async (input) => {
            const { command } = input;
            try {
                const result = await sandbox.runCommand({
                    cmd: 'bash',
                    args: ['-c', command],
                    signal: AbortSignal.timeout(COMMAND_TIMEOUT_MS),
                });
                const stdout = await result.stdout();
                const truncatedOutput = truncateOutput(stdout);
                await emitStatus(agentId, 'running', 'tool_run_command', truncatedOutput, { arguments: input });
                return truncatedOutput;
            } catch (error: unknown) {
                const isTimeout = error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError');
                if (isTimeout) {
                    const message = `Command timed out after ${COMMAND_TIMEOUT_MS / 1000}s. The command likely starts a long-running process (e.g. a dev server). Use background execution instead: "command &> output.log & sleep 2; tail output.log"`;
                    await emitStatus(agentId, 'running', 'tool_run_command', message, { arguments: input });
                    return message;
                }
                throw error;
            }
        },
    });

    return { listFiles, readFile, updateFile, runCommand };
}
