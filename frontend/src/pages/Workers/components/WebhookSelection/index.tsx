import { GitHubWebhook } from './GitHubWebhook';
import { PostHogWebhook } from './PostHogWebhook';

interface Props {
    integration: string;
    slug: string;
}

export function WebhookSelection({ integration, slug }: Props) {
    if (integration === 'GitHub') {
        return <GitHubWebhook />;
    }
    if (integration === 'PostHog') {
        return <PostHogWebhook slug={slug} />;
    }
    return null;
}

