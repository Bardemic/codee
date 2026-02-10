import { z } from 'zod';
import { tool } from 'ai';
import { emitStatus } from '../../../stream/events';
import type { ToolCallImage } from '../../../db/entities/ToolCall';
import { browserSessions, type BrowserToolResult } from '../session';

export function buildScreenshotTool(params: { agentId: number }) {
    const { agentId } = params;

    return tool<Record<string, never>, BrowserToolResult>({
        description: 'Capture a screenshot of the current browser page. The screenshot will be returned as an image that you can see and analyze.',
        inputSchema: z.object({}),
        execute: async (_input, _options) => {
            await emitStatus(agentId, 'running', 'tool_browser_screenshot', 'Capturing screenshot', { arguments: {} });

            const session = browserSessions.get(agentId);
            if (!session) {
                return { text: 'Error: No browser session found. Call browser_create_session first.' };
            }

            const { sessionId, client } = session;

            const result = await client.browsers.playwright.execute(sessionId, {
                code: `
                    const screenshot = await page.screenshot({
                        type: 'png',
                        fullPage: true,
                    });
                    return screenshot.toString('base64');
                `,
                timeout_sec: 60,
            });
            const base64 = result.result as string;

            const image: ToolCallImage = {
                data: base64,
                mimeType: 'image/png',
            };

            await emitStatus(agentId, 'running', 'tool_browser_screenshot', 'Screenshot captured', {
                arguments: {},
                images: [image],
            });

            return {
                text: 'Screenshot captured successfully.',
                images: [image],
            };
        },
        toModelOutput: ({ output }) => {
            const content: Array<{ type: 'text'; text: string } | { type: 'image-data'; data: string; mediaType: string }> = [
                { type: 'text' as const, text: output.text },
            ];

            if (output.images && output.images.length > 0) {
                for (const image of output.images) {
                    content.push({
                        type: 'image-data' as const,
                        data: image.data,
                        mediaType: image.mimeType,
                    });
                }
            }

            return {
                type: 'content' as const,
                value: content,
            };
        },
    });
}
