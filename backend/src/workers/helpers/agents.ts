import { AppDataSource } from '../../db/data-source';
import { Agent } from '../../db/entities/Agent';
import { Message, type SenderType } from '../../db/entities/Message';

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
