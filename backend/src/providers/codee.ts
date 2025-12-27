import type { CloudProvider } from './base';
import { Workspace } from '../db/entities/Workspace';
import { Agent, AgentStatus, ProviderType } from '../db/entities/Agent';
import { AppDataSource } from '../db/data-source';
import { enqueueAgentJob } from '../workers/queue';
import { Message } from '../db/entities/Message';
import { emitStatus } from '../stream/events';
import { ToolCall } from '../db/entities/ToolCall';
import { In } from 'typeorm';

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
        const messageIds = messages.map((message) => message.id);
        const toolCalls = messageIds.length
            ? await AppDataSource.getRepository(ToolCall).find({
                  where: { message: { id: In(messageIds) } },
                  relations: ['message'],
                  order: { createdAt: 'ASC' },
              })
            : [];
        type TransformedToolCall = {
            id: number;
            created_at: Date;
            tool_name: string;
            arguments: Record<string, unknown>;
            result: string;
            status: string;
            duration_ms: number | null;
        };
        const toolCallsByMessage = new Map<number, TransformedToolCall[]>();
        for (const toolCall of toolCalls) {
            const list = toolCallsByMessage.get(toolCall.message.id) || [];
            list.push({
                id: toolCall.id,
                created_at: toolCall.createdAt,
                tool_name: toolCall.toolName,
                arguments: toolCall.arguments,
                result: toolCall.result,
                status: toolCall.status,
                duration_ms: toolCall.durationMs,
            });
            toolCallsByMessage.set(toolCall.message.id, list);
        }
        return messages.map((message) => ({
            id: message.id,
            created_at: message.createdAt,
            content: message.content,
            sender: message.sender,
            tool_calls: toolCallsByMessage.get(message.id) || [],
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

        emitStatus(agent.id, 'queued', 'init', 'queued follow-up').catch((err) => {
            console.error('Failed to emit status:', err);
        });

        enqueueAgentJob({ agentId: agent.id, prompt: message }).catch((err) => {
            console.error('Failed to enqueue agent job:', err);
        });

        return true;
    }
}
