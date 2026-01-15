import { z } from 'zod';
import { tool, zodSchema } from 'ai';
import { emitStatus } from '../../../stream/events';
import { browserSessions, type BrowserToolResult } from '../session';

const getPageContentSchema = z.object({
    format: z.enum(['html', 'text']).optional().default('text').describe('Format to return: "html" for full HTML, "text" for visible text only'),
});

export function buildGetPageContentTool(params: { agentId: number }) {
    const { agentId } = params;

    return tool({
        description:
            'Get the current page content as HTML or visible text. Useful for understanding what the browser is displaying and debugging rendering issues.',
        inputSchema: zodSchema(getPageContentSchema),
        execute: async (input): Promise<BrowserToolResult> => {
            const { format } = input;
            await emitStatus(agentId, 'running', 'tool_browser_get_page_content', `Getting page content as ${format}`, { arguments: input });

            const session = browserSessions.get(agentId);
            if (!session) {
                return { text: 'Error: No browser session found. Call browser_create_session first.' };
            }

            const { sessionId, client } = session;

            const code = format === 'html' ? `return await page.content();` : `return await page.innerText('body');`;

            const result = await client.browsers.playwright.execute(sessionId, {
                code,
                timeout_sec: 15,
            });

            const content = (result.result as string) || '';

            const maxLength = 50000;
            const truncated = content.length > maxLength;
            const displayContent = truncated ? content.substring(0, maxLength) + '\n\n... (content truncated)' : content;

            await emitStatus(agentId, 'running', 'tool_browser_get_page_content', `Retrieved page ${format}`, { arguments: input });

            return { text: `Page ${format.toUpperCase()} Content:\n${displayContent}` };
        },
    });
}
