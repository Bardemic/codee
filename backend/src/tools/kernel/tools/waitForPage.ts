import { z } from 'zod';
import { tool, zodSchema } from 'ai';
import { emitStatus } from '../../../stream/events';
import { browserSessions, type BrowserToolResult } from '../session';

const waitForPageLoadSchema = z.object({
    selector: z.string().optional().describe('Optional CSS selector to wait for'),
    timeout_sec: z.number().optional().default(30).describe('Timeout in seconds'),
});

export function buildWaitForPageTool(params: { agentId: number }) {
    const { agentId } = params;

    return tool({
        description:
            'Wait for the page to finish loading or for a specific element to appear. Use this after navigation if you need to ensure content is fully rendered.',
        inputSchema: zodSchema(waitForPageLoadSchema),
        execute: async (input): Promise<BrowserToolResult> => {
            const { selector, timeout_sec } = input;
            await emitStatus(agentId, 'running', 'tool_browser_wait_for_page', selector ? `Waiting for ${selector}` : 'Waiting for page load', {
                arguments: input,
            });

            const session = browserSessions.get(agentId);
            if (!session) {
                return { text: 'Error: No browser session found. Call browser_create_session first.' };
            }

            const { sessionId, client } = session;

            try {
                if (selector) {
                    await client.browsers.playwright.execute(sessionId, {
                        code: `await page.waitForSelector('${selector.replace(/'/g, "\\'")}', { timeout: ${(timeout_sec || 30) * 1000} });`,
                        timeout_sec: (timeout_sec || 30) + 5,
                    });
                    return { text: `Element "${selector}" found and visible.` };
                } else {
                    await client.browsers.playwright.execute(sessionId, {
                        code: `
                            await page.waitForLoadState('domcontentloaded', { timeout: ${(timeout_sec || 30) * 1000} });
                            await page.waitForTimeout(1000);
                            try {
                                await page.waitForLoadState('networkidle', { timeout: 5000 });
                            } catch (e) {
                                // Network may not be idle, that's okay
                            }
                        `,
                        timeout_sec: (timeout_sec || 30) + 10,
                    });
                    return { text: 'Page finished loading.' };
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                return { text: `Timeout waiting for page: ${message}` };
            }
        },
    });
}
