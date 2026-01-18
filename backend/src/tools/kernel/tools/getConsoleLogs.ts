import { z } from 'zod';
import { tool, zodSchema } from 'ai';
import { emitStatus } from '../../../stream/events';
import { browserSessions, type BrowserToolResult } from '../session';

const getConsoleLogsSchema = z.object({
    clear: z.boolean().optional().default(false).describe('Whether to clear the logs after retrieving them'),
});

export function buildGetConsoleLogsTool(params: { agentId: number }) {
    const { agentId } = params;

    return tool({
        description: 'Get console logs (log, warn, error, info) captured from the browser. Useful for debugging JavaScript errors and application behavior.',
        inputSchema: zodSchema(getConsoleLogsSchema),
        execute: async (input): Promise<BrowserToolResult> => {
            const { clear } = input;
            await emitStatus(agentId, 'running', 'tool_browser_get_console_logs', 'Retrieving console logs', { arguments: input });

            const session = browserSessions.get(agentId);
            if (!session) {
                return { text: 'Error: No browser session found. Call browser_create_session first.' };
            }

            const { sessionId, client } = session;

            const result = await client.browsers.playwright.execute(sessionId, {
                code: `
                    const logs = window.__consoleLogs || [];
                    if (${clear}) {
                        window.__consoleLogs = [];
                    }
                    return logs;
                `,
                timeout_sec: 10,
            });

            const logs = (result.result as Array<{ type: string; text: string; timestamp: string }>) || [];

            if (logs.length === 0) {
                return { text: 'No console logs captured.' };
            }

            const formattedLogs = logs.map((log) => `[${log.timestamp}] [${log.type.toUpperCase()}] ${log.text}`).join('\n');

            await emitStatus(agentId, 'running', 'tool_browser_get_console_logs', `Retrieved ${logs.length} console logs`, { arguments: input });

            return { text: `Console Logs (${logs.length} entries):\n${formattedLogs}` };
        },
    });
}
