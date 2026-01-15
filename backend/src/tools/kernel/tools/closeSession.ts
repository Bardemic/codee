import { z } from 'zod';
import { tool, zodSchema } from 'ai';
import { emitStatus } from '../../../stream/events';
import { browserSessions, consoleLogs, networkLogs, type BrowserToolResult } from '../session';

const closeSessionSchema = z.object({});

export function buildCloseSessionTool(params: { agentId: number }) {
    const { agentId } = params;

    return tool({
        description: 'Close the current browser session and clean up resources.',
        inputSchema: zodSchema(closeSessionSchema),
        execute: async (input): Promise<BrowserToolResult> => {
            await emitStatus(agentId, 'running', 'tool_browser_close_session', 'Closing browser session', { arguments: input });

            const session = browserSessions.get(agentId);
            if (!session) {
                return { text: 'No browser session to close.' };
            }

            const { sessionId, client } = session;

            await client.browsers.deleteByID(sessionId);
            browserSessions.delete(agentId);
            consoleLogs.delete(agentId);
            networkLogs.delete(agentId);

            await emitStatus(agentId, 'running', 'tool_browser_close_session', 'Browser session closed', { arguments: input });

            return { text: 'Browser session closed successfully.' };
        },
    });
}
