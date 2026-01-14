import { DataSource } from 'typeorm';
import { IntegrationProvider } from './entities/IntegrationProvider';
import { Tool } from './entities/Tool';

type ProviderSeed = {
    slug: string;
    displayName: string;
    hasCloudAgent: boolean;
    tools: Array<{ displayName: string; slugName: string; isModel?: boolean }>;
};

const PROVIDER_SEEDS: ProviderSeed[] = [
    {
        slug: 'codee',
        displayName: 'Codee',
        hasCloudAgent: true,
        tools: [],
    },
    {
        slug: 'github_app',
        displayName: 'GitHub App',
        hasCloudAgent: false,
        tools: [{ displayName: 'Commits', slugName: 'github/commits' }],
    },
    {
        slug: 'posthog',
        displayName: 'PostHog',
        hasCloudAgent: false,
        tools: [
            { displayName: 'Insights', slugName: 'posthog/insights' },
            {
                displayName: 'Query Runner',
                slugName: 'posthog/query_runner',
            },
            { displayName: 'Error Tools', slugName: 'posthog/errors' },
            {
                displayName: 'Documentation',
                slugName: 'posthog/documentation',
            },
        ],
    },
    {
        slug: 'cursor',
        displayName: 'Cursor',
        hasCloudAgent: true,
        tools: [],
    },
    {
        slug: 'jules',
        displayName: 'Jules',
        hasCloudAgent: true,
        tools: [],
    },
    {
        slug: 'slack',
        displayName: 'Slack',
        hasCloudAgent: false,
        tools: [],
    },
    {
        slug: 'browser',
        displayName: 'Browser Automation',
        hasCloudAgent: false,
        tools: [
            { displayName: 'Navigate', slugName: 'browser/navigate' },
            { displayName: 'Snapshot', slugName: 'browser/snapshot' },
            { displayName: 'Click', slugName: 'browser/click' },
            { displayName: 'Type', slugName: 'browser/type' },
            { displayName: 'Screenshot', slugName: 'browser/screenshot' },
            { displayName: 'Get Text', slugName: 'browser/get_text' },
            { displayName: 'Go Back', slugName: 'browser/go_back' },
            { displayName: 'Wait For', slugName: 'browser/wait_for' },
            { displayName: 'Close', slugName: 'browser/close' },
            { displayName: 'Fill Form', slugName: 'browser/fill_form' },
        ],
    },
];

export async function seedDefaults(ds: DataSource) {
    for (const providerSeed of PROVIDER_SEEDS) {
        let provider = await ds.getRepository(IntegrationProvider).findOne({ where: { slug: providerSeed.slug } });
        if (!provider) {
            provider = ds.getRepository(IntegrationProvider).create({
                slug: providerSeed.slug,
                displayName: providerSeed.displayName,
                hasCloudAgent: providerSeed.hasCloudAgent,
            });
            await ds.getRepository(IntegrationProvider).save(provider);
        }

        for (const toolSeed of providerSeed.tools) {
            const exists = await ds.getRepository(Tool).findOne({
                where: {
                    slugName: toolSeed.slugName,
                    provider: { id: provider.id },
                },
                relations: ['provider'],
            });
            if (!exists) {
                const tool = ds.getRepository(Tool).create({
                    displayName: toolSeed.displayName,
                    slugName: toolSeed.slugName,
                    isModel: !!toolSeed.isModel,
                    provider,
                });
                await ds.getRepository(Tool).save(tool);
            }
        }
    }
}
