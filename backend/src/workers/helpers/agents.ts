import { AppDataSource } from '../../db/data-source';
import { Agent } from '../../db/entities/Agent';
import { Message, type SenderType } from '../../db/entities/Message';
import { ToolCall } from '../../db/entities/ToolCall';
import { readHistorySince } from '../../stream/events';

export type AgentMessage = {
    id: number;
    created_at: Date;
    content: string;
    sender: SenderType;
};

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

export async function getAgentMessages(agentId: number): Promise<AgentMessage[]> {
    const messages = await AppDataSource.getRepository(Message).find({
        where: { agent: { id: agentId } },
        order: { createdAt: 'ASC' },
    });

    return messages.map((message) => ({
        id: message.id,
        created_at: message.createdAt,
        content: message.content,
        sender: message.sender,
    }));
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
