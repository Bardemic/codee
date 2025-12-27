import { PostHog } from 'posthog-node';

const API_KEY = process.env.POSTHOG_API_KEY;
const HOST = process.env.POSTHOG_HOST || 'https://us.i.posthog.com';

let client: PostHog | null = null;

export function getPostHog(): PostHog {
    if (!API_KEY) throw new Error('POSTHOG_API_KEY is required');
    if (client) return client;
    client = new PostHog(API_KEY, { host: HOST });
    return client;
}

export async function flushPostHog() {
    if (client) {
        await client.shutdown();
        client = null;
    }
}
