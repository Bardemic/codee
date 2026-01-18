import { z } from 'zod';
import { tool, zodSchema } from 'ai';
import { emitStatus } from '../../../stream/events';
import { browserSessions, type BrowserToolResult } from '../session';

const executeSchema = z.object({
    code: z.string().describe('Playwright/JavaScript code to execute. Has access to `page`, `context`, and `browser` variables.'),
    timeout_sec: z.number().optional().default(60).describe('Execution timeout in seconds'),
});

export function buildExecuteTool(params: { agentId: number }) {
    const { agentId } = params;

    return tool({
        description:
            'Execute arbitrary Playwright code in the browser. Has access to `page`, `context`, and `browser` variables. Use this for complex interactions not covered by other tools.',
        inputSchema: zodSchema(executeSchema),
        execute: async (input): Promise<BrowserToolResult> => {
            const { code, timeout_sec } = input;
            await emitStatus(agentId, 'running', 'tool_browser_execute', `Executing Playwright code`, { arguments: input });

            const session = browserSessions.get(agentId);
            if (!session) {
                return { text: 'Error: No browser session found. Call browser_create_session first.' };
            }

            const { sessionId, client } = session;

            const result = await client.browsers.playwright.execute(sessionId, {
                code,
                timeout_sec: timeout_sec || 60,
            });

            await emitStatus(agentId, 'running', 'tool_browser_execute', 'Code executed', { arguments: input });

            return {
                text: result.result !== undefined ? `Execution result: ${JSON.stringify(result.result)}` : 'Code executed successfully.',
            };
        },
    });
}
