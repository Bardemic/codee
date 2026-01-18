import { z } from 'zod';
import { tool, zodSchema } from 'ai';
import { emitStatus } from '../../../stream/events';
import { browserSessions, type BrowserToolResult } from '../session';

const navigateSchema = z.object({
    url: z.string().describe('URL to navigate to'),
});

export function buildNavigateTool(params: { agentId: number }) {
    const { agentId } = params;

    return tool({
        description: 'Navigate the browser to a specific URL. Waits for page to load.',
        inputSchema: zodSchema(navigateSchema),
        execute: async (input): Promise<BrowserToolResult> => {
            const { url } = input;
            await emitStatus(agentId, 'running', 'tool_browser_navigate', `Navigating to ${url}`, { arguments: input });

            const session = browserSessions.get(agentId);
            if (!session) {
                return { text: 'Error: No browser session found. Call browser_create_session first.' };
            }

            const { sessionId, client } = session;

            await client.browsers.playwright.execute(sessionId, {
                code: `
                    await page.goto(${JSON.stringify(url)}, { waitUntil: 'domcontentloaded', timeout: 30000 });
                    // Wait for any pending JS to execute
                    await page.waitForTimeout(2000);
                    // Try to wait for network idle, but don't fail if it times out
                    try {
                        await page.waitForLoadState('networkidle', { timeout: 5000 });
                    } catch (e) {
                        // Page may have continuous network activity, that's okay
                    }
                `,
                timeout_sec: 45,
            });

            await emitStatus(agentId, 'running', 'tool_browser_navigate', `Navigated to ${url}`, { arguments: input });

            return { text: `Successfully navigated to ${url}` };
        },
    });
}
