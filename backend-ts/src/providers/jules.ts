import { TRPCError } from '@trpc/server';
import type { CloudProvider } from './base';
import { Workspace } from '../db/entities/Workspace';
import { Agent, AgentStatus, ProviderType } from '../db/entities/Agent';
import { AppDataSource } from '../db/data-source';
import { Message } from '../db/entities/Message';

export class JulesProvider implements CloudProvider {
    slug = 'Jules';

    async createAgent({
        workspace,
        message,
        model,
    }: {
        userId: string;
        workspace: Workspace;
        repositoryFullName: string;
        message: string;
        toolSlugs: string[];
        model?: string | null;
    }): Promise<Agent> {
        const agentRepository = AppDataSource.getRepository(Agent);
        const agent = agentRepository.create({
            workspace,
            providerType: ProviderType.JULES,
            conversationId: 'jules',
            url: '',
            status: AgentStatus.PENDING,
            name: `Jules Agent${model ? ` (${model})` : ''}`,
            model: model || null,
        });
        await agentRepository.save(agent);
        await AppDataSource.getRepository(Message).save(
            AppDataSource.getRepository(Message).create({
                agent,
                content: message,
                sender: 'USER',
            })
        );
        // create jules agent
        return agent;
    }

    async getMessages(_agent: Agent) {
        return [];
    }

    async sendMessage(_agent: Agent, _message: string): Promise<boolean> {
        throw new TRPCError({
            code: 'NOT_IMPLEMENTED',
            message: 'Jules provider follow-up not implemented yet',
        });
    }
}
