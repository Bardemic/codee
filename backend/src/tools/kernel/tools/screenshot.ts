import { z } from 'zod';
import { tool, zodSchema } from 'ai';
import { emitStatus } from '../../../stream/events';
import type { ToolCallImage } from '../../../db/entities/ToolCall';
import { browserSessions, type BrowserToolResult } from '../session';

const screenshotSchema = z.object({});

export function buildScreenshotTool(params: { agentId: number }) {
    const { agentId } = params;

    return tool({
        description: 'Capture a screenshot of the current browser page. The screenshot will be stored and can be viewed in the tool call history.',
        inputSchema: zodSchema(screenshotSchema),
        execute: async (input): Promise<BrowserToolResult> => {
            await emitStatus(agentId, 'running', 'tool_browser_screenshot', 'Capturing screenshot', { arguments: input });

            const session = browserSessions.get(agentId);
            if (!session) {
                return { text: 'Error: No browser session found. Call browser_create_session first.' };
            }

            const { sessionId, client } = session;

            const response = await client.browsers.computer.captureScreenshot(sessionId);
            const blob = await response.blob();
            const arrayBuffer = await blob.arrayBuffer();
            const base64 = Buffer.from(arrayBuffer).toString('base64');

            const image: ToolCallImage = {
                data: base64,
                mimeType: 'image/png',
            };

            await emitStatus(agentId, 'running', 'tool_browser_screenshot', 'Screenshot captured', { arguments: input });

            return {
                text: 'Screenshot captured successfully.',
                images: [image],
            };
        },
    });
}
