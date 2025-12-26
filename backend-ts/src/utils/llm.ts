import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { withTracing } from '@posthog/ai';
import { z } from 'zod';
import { getPostHog } from './posthog';

const openaiClient = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    compatibility: 'strict',
});

export async function generateTitle(prompt: string): Promise<string> {
    const postHogClient = getPostHog();
    const model = withTracing(openaiClient('gpt-5-nano'), postHogClient, {
        posthogDistinctId: 'system',
        posthogProperties: { purpose: 'generate_title' },
    });

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
        if (title.length > 0) return title;
    } catch (err) {
        console.warn('title generation fallback', err);
    }
    return 'Default Title';
}
