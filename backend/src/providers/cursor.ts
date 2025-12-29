import { TRPCError } from '@trpc/server';
import type { CloudProvider } from './base';
import { Workspace } from '../db/entities/Workspace';
import { Agent, AgentStatus, ProviderType } from '../db/entities/Agent';
import { AppDataSource } from '../db/data-source';
import { IntegrationConnection } from '../db/entities/IntegrationConnection';
import { z } from 'zod';
import axios from 'axios';

export class CursorProvider implements CloudProvider {
    slug = 'Cursor';

    async createAgent({
        userId,
        workspace,
        repositoryFullName,
        message,
        model,
        baseBranch,
    }: {
        userId: string;
        workspace: Workspace;
        repositoryFullName: string;
        message: string;
        toolSlugs: string[];
        baseBranch: string;
        model?: string | null;
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
        });
        await agentRepository.save(agent);

        const connectionRepository = AppDataSource.getRepository(IntegrationConnection);
        const cursorConnection = await connectionRepository.findOne({
            where: { userId, provider: { slug: 'cursor' } },
            relations: ['provider'],
        });

        if (!cursorConnection) {
            throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'Cursor not connected',
            });
        }

        const apiKey = cursorConnection.getDataConfig()?.api_key;
        if (!apiKey) {
            throw new TRPCError({
                code: 'BAD_REQUEST',
                message: 'Cursor API key not found',
            });
        }

        const payload = {
            prompt: { text: message },
            source: { repository: `https://github.com/${repositoryFullName}` },
            ...(model ? { model } : {}),
            // target: { autoCreatePr: false, branchName: '' },
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
        const connectionRepository = AppDataSource.getRepository(IntegrationConnection);
        const cursorConnection = await connectionRepository.findOne({
            where: { userId: agent.workspace.userId, provider: { slug: 'cursor' } },
            relations: ['provider'],
        });

        if (!cursorConnection) {
            throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'Cursor not connected',
            });
        }

        const apiKey = cursorConnection.getDataConfig()?.api_key;
        if (!apiKey) {
            throw new TRPCError({
                code: 'BAD_REQUEST',
                message: 'Cursor API key not found',
            });
        }

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

            return parsedResponse.data.messages.map((msg, index) => ({
                id: index + 1,
                created_at: new Date(),
                content: msg.text,
                sender: msg.type === 'user_message' ? ('USER' as const) : ('AGENT' as const),
                tool_calls: [],
            }));
        } catch (error) {
            console.error('Cursor provider getMessages error:', error, 'Agent ID:', agent.id);
            return [];
        }
    }

    async sendMessage(agent: Agent, message: string): Promise<boolean> {
        const connectionRepository = AppDataSource.getRepository(IntegrationConnection);
        const cursorConnection = await connectionRepository.findOne({
            where: { userId: agent.workspace.userId, provider: { slug: 'cursor' } },
            relations: ['provider'],
        });

        if (!cursorConnection) {
            throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'Cursor not connected',
            });
        }

        const apiKey = cursorConnection.getDataConfig()?.api_key;
        if (!apiKey) {
            throw new TRPCError({
                code: 'BAD_REQUEST',
                message: 'Cursor API key not found',
            });
        }

        const payload = {
            prompt: {
                text: message,
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
