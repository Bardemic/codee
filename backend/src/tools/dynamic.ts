import type { Sandbox } from '@vercel/sandbox';
import { buildQueryRunnerTools, buildInsightTools, buildErrorTools, buildDocumentationTools, type ToolCollection } from './posthog/index';
import { buildCommitTools } from './github/commits';

export async function buildDynamicTools(agentId: number, toolSlugs: string[], sandbox: Sandbox): Promise<ToolCollection> {
    const tools: ToolCollection = {};

    const posthogSlugs = toolSlugs.filter((slug) => slug.startsWith('posthog/'));
    if (posthogSlugs.length > 0) {
        if (toolSlugs.includes('posthog/query_runner')) {
            const queryTools = await buildQueryRunnerTools(agentId);
            Object.assign(tools, queryTools);
        }

        if (toolSlugs.includes('posthog/insights')) {
            const [queryTools, insightTools] = await Promise.all([buildQueryRunnerTools(agentId), buildInsightTools(agentId)]);
            Object.assign(tools, queryTools, insightTools);
        }

        if (toolSlugs.includes('posthog/errors')) {
            const errorTools = await buildErrorTools(agentId);
            Object.assign(tools, errorTools);
        }

        if (toolSlugs.includes('posthog/documentation')) {
            const docTools = await buildDocumentationTools(agentId);
            Object.assign(tools, docTools);
        }
    }

    if (toolSlugs.includes('github/commits')) {
        Object.assign(tools, buildCommitTools(sandbox));
    }

    return tools;
}
