import type { CloudProvider } from './base';
import { CodeeProvider } from './codee';
import { CursorProvider } from './cursor';
import { JulesProvider } from './jules';
import type { Workspace } from '../db/entities/Workspace';
import type { Agent } from '../db/entities/Agent';
import type { MessageImage } from '../db/entities/Message';

export const PROVIDERS: Record<string, new () => CloudProvider> = {
    Codee: CodeeProvider,
    Cursor: CursorProvider,
    Jules: JulesProvider,
};

export type CloudProviderConfig = {
    name: string;
    agents: Array<{ model?: string | null }>;
};

export async function createAgentsFromProviders(params: {
    organizationId: number;
    workspace: Workspace;
    repositoryFullName: string;
    message: string;
    toolSlugs: string[];
    branchName: string;
    cloudProviders: CloudProviderConfig[];
    images: MessageImage[];
    environmentId?: number | null;
}): Promise<Agent> {
    let first: Agent | null = null;
    for (const config of params.cloudProviders) {
        const ProviderClass = PROVIDERS[config.name];
        if (!ProviderClass) continue;
        const provider = new ProviderClass();
        for (const agentConfig of config.agents) {
            const agent = await provider.createAgent({
                organizationId: params.organizationId,
                workspace: params.workspace,
                repositoryFullName: params.repositoryFullName,
                message: params.message,
                toolSlugs: params.toolSlugs,
                baseBranch: params.branchName,
                model: agentConfig.model,
                isOrchestratorAgent: false,
                images: params.images,
                environmentId: params.environmentId,
            });
            if (!first) first = agent;
        }
    }
    if (!first) {
        throw new Error('No agents created');
    }
    return first;
}
