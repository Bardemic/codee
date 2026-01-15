import { z } from 'zod';
import { tool, zodSchema } from 'ai';
import type { Sandbox } from '@vercel/sandbox';
import { emitStatus } from '../../../stream/events';
import type { BrowserToolResult } from '../session';

const startDevServerSchema = z.object({
    command: z.string().describe('Command to start the dev server (e.g., "npm run dev", "bun dev")'),
    port: z.number().describe('Port the dev server will run on (e.g., 3000)'),
});

export function buildStartDevServerTool(params: { agentId: number; sandbox: Sandbox }) {
    const { agentId, sandbox } = params;

    return tool({
        description:
            'Start a development server in the sandbox and expose it via a public URL. Use this before browser_create_session to make your app accessible to the browser.',
        inputSchema: zodSchema(startDevServerSchema),
        execute: async (input): Promise<BrowserToolResult> => {
            const { command, port } = input;
            await emitStatus(agentId, 'running', 'tool_browser_start_dev_server', `Starting dev server: ${command}`, { arguments: input });

            await sandbox.runCommand({
                cmd: 'bash',
                args: ['-c', command],
                detached: true,
            });

            const publicUrl = sandbox.domain(port);

            const maxAttempts = 30;
            let serverReady = false;
            for (let attempt = 0; attempt < maxAttempts; attempt++) {
                await new Promise((resolve) => setTimeout(resolve, 2000));
                try {
                    const response = await fetch(publicUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
                    if (response.ok || response.status < 500) {
                        serverReady = true;
                        break;
                    }
                } catch {
                    // Server not ready yet, continue polling
                }
                if (attempt % 5 === 0) {
                    await emitStatus(agentId, 'running', 'tool_browser_start_dev_server', `Waiting for server to start... (${(attempt + 1) * 2}s)`, {
                        arguments: input,
                    });
                }
            }

            if (!serverReady) {
                return {
                    text: `Dev server started but may not be ready yet. Public URL: ${publicUrl}\nNote: The server did not respond within 60 seconds. It may still be starting up or there could be an issue with the application.`,
                };
            }

            await emitStatus(agentId, 'running', 'tool_browser_start_dev_server', `Dev server started at ${publicUrl}`, { arguments: input });

            return {
                text: `Dev server started successfully and is responding. Public URL: ${publicUrl}`,
            };
        },
    });
}
