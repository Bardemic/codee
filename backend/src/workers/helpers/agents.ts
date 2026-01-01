import { TRPCError } from '@trpc/server';
import { AppDataSource } from '../../db/data-source';
import { Agent } from '../../db/entities/Agent';
import { IntegrationConnection } from '../../db/entities/IntegrationConnection';
import { Message, type SenderType } from '../../db/entities/Message';
import { ToolCall } from '../../db/entities/ToolCall';
import { readHistorySince } from '../../stream/events';

export async function getAgentById(agentId: number) {
    return AppDataSource.getRepository(Agent).findOne({
        where: { id: agentId },
        relations: ['workspace'],
    });
}

export async function saveMessage(agent: Agent, content: string, sender: SenderType) {
    const messageRepository = AppDataSource.getRepository(Message);
    const msg = messageRepository.create({ agent, content, sender });
    return messageRepository.save(msg);
}

export async function updateAgent(agent: Agent, updates: Partial<Agent>) {
    Object.assign(agent, updates);
    return AppDataSource.getRepository(Agent).save(agent);
}

export async function persistToolCallsFromRedis(agentId: number, message: Message): Promise<void> {
    try {
        const events = await readHistorySince(agentId, 0);
        if (events.length === 0) return;

        const toolCallRepository = AppDataSource.getRepository(ToolCall);
        const agent = await getAgentById(agentId);

        if (!agent) {
            console.warn(`persistToolCallsFromRedis: agent ${agentId} not found`);
            return;
        }

        const toolCallsToSave: ToolCall[] = [];

        for (const event of events) {
            const isToolEvent = event.event === 'status' && typeof event.step === 'string' && event.step.startsWith('tool_');
            if (!isToolEvent) continue;

            let parsedArguments: Record<string, unknown> = {};
            const rawArguments = event.arguments as unknown;
            if (typeof rawArguments === 'string') {
                try {
                    parsedArguments = JSON.parse(rawArguments);
                } catch {
                    parsedArguments = { raw: rawArguments };
                }
            } else if (rawArguments && typeof rawArguments === 'object') {
                parsedArguments = rawArguments as Record<string, unknown>;
            }

            const toolCall = toolCallRepository.create({
                agent,
                message,
                toolName: event.step as string,
                arguments: parsedArguments,
                result: (event.detail as string) ?? '',
                status: (event.phase as string) ?? 'success',
                durationMs: null,
            });

            toolCall.createdAt = new Date(event.timestamp);
            toolCallsToSave.push(toolCall);
        }

        if (toolCallsToSave.length > 0) {
            await toolCallRepository.save(toolCallsToSave);
        }
    } catch (error) {
        console.warn('persistToolCallsFromRedis error:', error);
    }
}

export async function getIntegrationApiKey(userId: string, providerSlug: string): Promise<string> {
    const connectionRepository = AppDataSource.getRepository(IntegrationConnection);
    const connection = await connectionRepository.findOne({
        where: { userId, provider: { slug: providerSlug } },
        relations: ['provider'],
    });

    if (!connection) {
        throw new TRPCError({
            code: 'NOT_FOUND',
            message: `${providerSlug} not connected`,
        });
    }

    const apiKey = connection.getDataConfig()?.api_key;
    if (!apiKey) {
        throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `${providerSlug} API key not found`,
        });
    }

    return apiKey;
}
