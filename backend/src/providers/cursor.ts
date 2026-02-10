import type { CloudProvider } from './base';
import { Workspace } from '../db/entities/Workspace';
import { Agent, AgentStatus, ProviderType } from '../db/entities/Agent';
import { AppDataSource } from '../db/data-source';
import { z } from 'zod';
import axios from 'axios';
import { getIntegrationApiKey } from '../workflows/helpers/agents';
import type { MessageImage } from '../db/entities/Message';

export class CursorProvider implements CloudProvider {
    slug = 'Cursor';

    async createAgent({
        organizationId,
        workspace,
        repositoryFullName,
        message,
        model,
        baseBranch,
        images,
    }: {
        organizationId: number;
        workspace: Workspace;
        repositoryFullName: string;
        message: string;
        toolSlugs: string[];
        baseBranch: string;
        model?: string | null;
        images: MessageImage[];
        environmentId?: number | null;
    }): Promise<Agent> {
        const agentRepository = AppDataSource.getRepository(Agent);
        const agent = agentRepository.create({
            workspace,
            providerType: ProviderType.CURSOR,
            conversationId: 'cursor',
            url: '',
            status: AgentStatus.PENDING,
            name: `Cursor Agent${model ? ` (${model})` : ''}`,
            model: model || null,
            isOrchestratorAgent: false,
        });
        await agentRepository.save(agent);

        const apiKey = await getIntegrationApiKey(organizationId, 'cursor');

        const payload = {
            prompt: {
                text: message,
                ...(images.length > 0 && { images: images.map((image) => ({ data: image.data })) }),
            },
            source: { repository: `https://github.com/${repositoryFullName}`, ref: baseBranch },
            ...(model && { model }),
        };

        try {
            const response = await axios.post('https://api.cursor.com/v0/agents', payload, {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
                },
            });

            const responseSchema = z.object({
                id: z.string(),
                name: z.string(),
                target: z.object({
                    branchName: z.string(),
                    url: z.string(),
                }),
            });

            const parsedResponse = responseSchema.safeParse(response.data);

            if (!parsedResponse.success) {
                agent.status = AgentStatus.FAILED;
                console.error('Cursor API response parsing error:', parsedResponse.error);
                console.error('Response data:', response.data);
                return await agentRepository.save(agent);
            }

            agent.conversationId = parsedResponse.data.id;
            agent.url = parsedResponse.data.target.url;
            agent.githubBranchName = parsedResponse.data.target.branchName;
            agent.status = AgentStatus.RUNNING;
            await agentRepository.save(agent);

            return agent;
        } catch (error) {
            agent.status = AgentStatus.FAILED;
            console.error('Cursor provider agent creation error:', error);
            return await agentRepository.save(agent);
        }
    }

    async getMessages(agent: Agent) {
        const apiKey = await getIntegrationApiKey(agent.workspace.organizationId, 'cursor');

        try {
            const response = await axios.get(`https://api.cursor.com/v0/agents/${agent.conversationId}/conversation`, {
                headers: {
                    Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
                },
            });

            const conversationSchema = z.object({
                id: z.string(),
                messages: z.array(
                    z.object({
                        id: z.string(),
                        type: z.enum(['user_message', 'assistant_message']),
                        text: z.string(),
                    })
                ),
            });

            const parsedResponse = conversationSchema.safeParse(response.data);

            if (!parsedResponse.success) {
                console.error('Cursor API conversation response parsing error:', parsedResponse.error);
                console.error('Response data:', response.data);
                return [];
            }

            return parsedResponse.data.messages.map((message, index) => ({
                id: index + 1,
                created_at: new Date(),
                content: message.text,
                sender: message.type === 'user_message' ? ('USER' as const) : ('AGENT' as const),
                tool_calls: [],
                images: [],
            }));
        } catch (error) {
            console.error('Cursor provider getMessages error:', error, 'Agent ID:', agent.id);
            return [];
        }
    }

    async sendMessage(agent: Agent, message: string, images: MessageImage[]): Promise<boolean> {
        const apiKey = await getIntegrationApiKey(agent.workspace.organizationId, 'cursor');

        const payload = {
            prompt: {
                text: message,
                ...(images.length > 0 && { images: images.map((image) => ({ data: image.data })) }),
            },
        };

        try {
            const response = await axios.post(`https://api.cursor.com/v0/agents/${agent.conversationId}/followup`, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
                },
            });

            const followupSchema = z.object({
                id: z.string(),
            });

            const parsedResponse = followupSchema.safeParse(response.data);

            if (!parsedResponse.success) {
                console.error('Cursor API followup response parsing error:', parsedResponse.error);
                console.error('Response data:', response.data);
                return false;
            }

            return true;
        } catch (error) {
            console.error('Cursor provider sendMessage error:', error);
            return false;
        }
    }
}
