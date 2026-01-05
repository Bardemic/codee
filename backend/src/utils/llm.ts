import { generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
// import { getPostHog } from './posthog';

const openaiClient = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function generateTitle(prompt: string): Promise<string> {
    const model = openaiClient('gpt-5-nano');
    // const posthog = getPostHog(); setup posthog later if I want to bother w/ distinct id tracking

    try {
        const result = await generateObject({
            model,
            system: 'You are Codee, an async coding agent. Generate a concise workspace title under 7 words. Avoid filler like quotes or exclamations.',
            prompt,
            providerOptions: {
                openai: {
                    reasoningEffort: 'minimal',
                },
            },
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
