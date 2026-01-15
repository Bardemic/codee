import { z } from 'zod';
import { tool, zodSchema } from 'ai';
import { emitStatus } from '../../../stream/events';
import { browserSessions, type BrowserToolResult } from '../session';

const getNetworkLogsSchema = z.object({
    clear: z.boolean().optional().default(false).describe('Whether to clear the logs after retrieving them'),
});

export function buildGetNetworkLogsTool(params: { agentId: number }) {
    const { agentId } = params;

    return tool({
        description: 'Get network request logs captured from the browser. Useful for debugging API calls, failed requests, and resource loading.',
        inputSchema: zodSchema(getNetworkLogsSchema),
        execute: async (input): Promise<BrowserToolResult> => {
            const { clear } = input;
            await emitStatus(agentId, 'running', 'tool_browser_get_network_logs', 'Retrieving network logs', { arguments: input });

            const session = browserSessions.get(agentId);
            if (!session) {
                return { text: 'Error: No browser session found. Call browser_create_session first.' };
            }

            const { sessionId, client } = session;

            const result = await client.browsers.playwright.execute(sessionId, {
                code: `
                    const logs = window.__networkLogs || [];
                    if (${clear}) {
                        window.__networkLogs = [];
                    }
                    return logs;
                `,
                timeout_sec: 10,
            });

            const logs = (result.result as Array<{ method: string; url: string; status?: number; timestamp: string }>) || [];

            if (logs.length === 0) {
                return { text: 'No network logs captured.' };
            }

            const formattedLogs = logs.map((log) => `[${log.timestamp}] ${log.method} ${log.url} ${log.status ? `(${log.status})` : ''}`).join('\n');

            await emitStatus(agentId, 'running', 'tool_browser_get_network_logs', `Retrieved ${logs.length} network logs`, { arguments: input });

            return { text: `Network Logs (${logs.length} entries):\n${formattedLogs}` };
        },
    });
}
