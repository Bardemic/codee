import type { CloudProvider } from './base';
import { Workspace } from '../db/entities/Workspace';
import { Agent, AgentStatus, ProviderType } from '../db/entities/Agent';
import { AppDataSource } from '../db/data-source';
import { enqueueAgentJob } from '../workers/queue';
import { Message } from '../db/entities/Message';
import { emitStatus } from '../stream/events';

export class CodeeProvider implements CloudProvider {
    slug = 'Codee';

    async createAgent({
        workspace,
        repositoryFullName,
        message,
        toolSlugs,
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
        const messageRepository = AppDataSource.getRepository(Message);
        const agent = agentRepository.create({
            workspace,
            providerType: ProviderType.CODEE,
            conversationId: 'codee',
            url: '',
            status: AgentStatus.PENDING,
            name: `Codee Agent${model ? ` (${model})` : ''}`,
            model: model || null,
        });
        await agentRepository.save(agent);

        const userMessage = messageRepository.create({
            agent,
            content: message,
            sender: 'USER',
        });
        await messageRepository.save(userMessage);

        await emitStatus(agent.id, 'queued', 'init', 'queued agent job');
        await enqueueAgentJob({
            agentId: agent.id,
            prompt: message,
            repositoryFullName,
            toolSlugs,
        });
        return agent;
    }

    async getMessages(agent: Agent) {
        const messages = await AppDataSource.getRepository(Message).find({
            where: { agent: { id: agent.id } },
            order: { createdAt: 'ASC' },
        });

        return messages.map((message) => ({
            id: message.id,
            created_at: message.createdAt,
            content: message.content,
            sender: message.sender,
            tool_calls: [],
        }));
    }

    async sendMessage(agent: Agent, message: string) {
        const messageRepository = AppDataSource.getRepository(Message);
        const userMessage = messageRepository.create({
            agent,
            content: message,
            sender: 'USER',
        });
        await messageRepository.save(userMessage);

        await emitStatus(agent.id, 'queued', 'init', 'queued follow-up');
        await enqueueAgentJob({
            agentId: agent.id,
            prompt: message,
            // repositoryFullName not needed - will use agent's workspace
            // toolSlugs will be fetched from workspace tools
        });
        return true;
    }
}
