import { z } from 'zod';
import { tool, zodSchema } from 'ai';
import { emitStatus } from '../../../stream/events';
import { browserSessions, type BrowserToolResult } from '../session';

const typeSchema = z.object({
    selector: z.string().describe('CSS selector for the input element'),
    text: z.string().describe('Text to type into the element'),
});

export function buildTypeTool(params: { agentId: number }) {
    const { agentId } = params;

    return tool({
        description: 'Type text into an input element in the browser.',
        inputSchema: zodSchema(typeSchema),
        execute: async (input): Promise<BrowserToolResult> => {
            const { selector, text } = input;
            await emitStatus(agentId, 'running', 'tool_browser_type', `Typing into ${selector}`, { arguments: input });

            const session = browserSessions.get(agentId);
            if (!session) {
                return { text: 'Error: No browser session found. Call browser_create_session first.' };
            }

            const { sessionId, client } = session;

            await client.browsers.playwright.execute(sessionId, {
                code: `await page.fill(${JSON.stringify(selector)}, ${JSON.stringify(text)});`,
                timeout_sec: 30,
            });

            await emitStatus(agentId, 'running', 'tool_browser_type', `Typed into ${selector}`, { arguments: input });

            return { text: `Successfully typed "${text}" into element: ${selector}` };
        },
    });
}
