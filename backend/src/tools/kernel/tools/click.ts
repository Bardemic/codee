import { z } from 'zod';
import { tool, zodSchema } from 'ai';
import { emitStatus } from '../../../stream/events';
import { browserSessions, type BrowserToolResult } from '../session';

const clickSchema = z.object({
    selector: z.string().describe('CSS selector for the element to click'),
});

export function buildClickTool(params: { agentId: number }) {
    const { agentId } = params;

    return tool({
        description: 'Click on an element in the browser using a CSS selector.',
        inputSchema: zodSchema(clickSchema),
        execute: async (input): Promise<BrowserToolResult> => {
            const { selector } = input;
            await emitStatus(agentId, 'running', 'tool_browser_click', `Clicking ${selector}`, { arguments: input });

            const session = browserSessions.get(agentId);
            if (!session) {
                return { text: 'Error: No browser session found. Call browser_create_session first.' };
            }

            const { sessionId, client } = session;

            await client.browsers.playwright.execute(sessionId, {
                code: `await page.click('${selector.replace(/'/g, "\\'")}');`,
                timeout_sec: 30,
            });

            await emitStatus(agentId, 'running', 'tool_browser_click', `Clicked ${selector}`, { arguments: input });

            return { text: `Successfully clicked on element: ${selector}` };
        },
    });
}
