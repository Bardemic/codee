import { AppDataSource } from '../../db/data-source';
import { IntegrationConnection } from '../../db/entities/IntegrationConnection';
import { Agent } from '../../db/entities/Agent';
import { PostHogAgentToolkit } from '@posthog/agent-toolkit/integrations/ai-sdk';

const toolkitCache: Record<number, PostHogAgentToolkit> = {};

type PostHogToolkitTools = Awaited<ReturnType<PostHogAgentToolkit['getTools']>>;
export type ToolCollection = PostHogToolkitTools;

async function getPosthogApiKey(agentId: number): Promise<string | null> {
    const agent = await AppDataSource.getRepository(Agent).findOne({
        where: { id: agentId },
        relations: ['workspace'],
    });
    if (!agent) return null;

    const connection = await AppDataSource.getRepository(IntegrationConnection).findOne({
        where: {
            userId: agent.workspace.userId,
            provider: { slug: 'posthog' },
        },
        relations: ['provider'],
    });
    return connection?.getDataConfig()?.api_key || null;
}

export async function getToolkit(agentId: number): Promise<PostHogAgentToolkit | null> {
    if (toolkitCache[agentId]) {
        return toolkitCache[agentId];
    }

    const apiKey = await getPosthogApiKey(agentId);
    if (!apiKey) return null;

    const toolkit = new PostHogAgentToolkit({
        posthogPersonalApiKey: apiKey,
        posthogApiBaseUrl: 'https://app.posthog.com',
    });

    toolkitCache[agentId] = toolkit;
    return toolkit;
}

async function filterToolsByName(agentId: number, toolNames: string[]): Promise<ToolCollection> {
    const toolkit = await getToolkit(agentId);
    if (!toolkit) return {};

    const allTools = await toolkit.getTools();
    const filteredTools: ToolCollection = {};

    for (const [name, tool] of Object.entries(allTools)) {
        if (toolNames.includes(name)) {
            filteredTools[name.replace(/-/g, '_')] = tool;
        }
    }

    return filteredTools;
}

export async function buildQueryRunnerTools(agentId: number): Promise<ToolCollection> {
    return filterToolsByName(agentId, ['query-run', 'query-generate-hogql-from-question', 'docs-search']);
}

export async function buildInsightTools(agentId: number): Promise<ToolCollection> {
    return filterToolsByName(agentId, [
        'insight-create-from-query',
        'insight-delete',
        'insight-get',
        'insight-query',
        'insight-update',
        'insights-get-all',
        'query-generate-hogql-from-question',
        'query-run',
    ]);
}

export async function buildErrorTools(agentId: number): Promise<ToolCollection> {
    return filterToolsByName(agentId, ['error-details', 'list-errors']);
}

export async function buildDocumentationTools(agentId: number): Promise<ToolCollection> {
    return filterToolsByName(agentId, ['docs-search']);
}
