import { generateObject, type ModelMessage, type ToolCallPart, type ToolResultPart } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import type { Message } from '../db/entities/Message';
import type { ToolCall } from '../db/entities/ToolCall';

export async function generateTitle(prompt: string): Promise<string> {
    const model = google('gemini-2.5-flash-lite');
    // const posthog = getPostHog(); setup posthog later if I want to bother w/ distinct id tracking

    try {
        const result = await generateObject({
            model,
            system: 'You are Codee, an async coding agent. Generate a concise workspace title under 7 words. Avoid filler like quotes or exclamations.',
            prompt,
            schema: z.object({
                title: z
                    .string()
                    .max(80)
                    .transform((s) => s.trim())
                    .refine((s) => s.length > 0, 'title required'),
            }),
        });
        const title = result.object.title.trim();
        if (title.length > 0) {
            // posthog.capture({ event: 'generateTitle', distinctId: '' });
            return title;
        }
    } catch (err) {
        console.warn('title generation fallback', err);
        // posthog.capture({ event: 'generateTitleError', distinctId: '', properties: { prompt, error: err } });
    }
    return 'Default Title';
}

export function transformMessagesToModelMessages(previousMessages: Message[]): ModelMessage[] {
    const result: ModelMessage[] = [];

    for (const message of previousMessages) {
        if (message.sender === 'USER') {
            // User messages with images
            if (message.images && message.images.length > 0) {
                const content: Array<{ type: 'text'; text: string } | { type: 'image'; image: string; mimeType?: string }> = [
                    { type: 'text', text: message.content },
                ];
                for (const image of message.images) {
                    content.push({
                        type: 'image',
                        image: image.data,
                        mimeType: image.mimeType,
                    });
                }
                result.push({ role: 'user', content });
            } else {
                result.push({ role: 'user', content: message.content });
            }
        } else {
            // Agent messages - include tool calls if present
            const toolCalls = message.toolCalls || [];

            if (toolCalls.length > 0) {
                // Build assistant message with tool calls
                const assistantContent: Array<{ type: 'text'; text: string } | ToolCallPart> = [];

                // Add tool calls to assistant content
                for (const toolCall of toolCalls) {
                    assistantContent.push({
                        type: 'tool-call',
                        toolCallId: `tool_${toolCall.id}`,
                        toolName: toolCall.toolName,
                        input: toolCall.arguments,
                    });
                }

                // Add the final text response if present
                if (message.content) {
                    assistantContent.push({ type: 'text', text: message.content });
                }

                result.push({ role: 'assistant', content: assistantContent });

                // Add tool results as a separate tool message
                const toolResults: ToolResultPart[] = toolCalls.map((toolCall: ToolCall) => ({
                    type: 'tool-result' as const,
                    toolCallId: `tool_${toolCall.id}`,
                    toolName: toolCall.toolName,
                    output: { type: 'text' as const, value: toolCall.result || '' },
                }));

                result.push({ role: 'tool', content: toolResults });
            } else {
                // No tool calls, just add the text content
                result.push({ role: 'assistant', content: message.content });
            }
        }
    }

    return result;
}
