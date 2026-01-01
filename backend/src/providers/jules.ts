import type { CloudProvider } from './base';
import { Workspace } from '../db/entities/Workspace';
import { Agent, AgentStatus, ProviderType } from '../db/entities/Agent';
import { AppDataSource } from '../db/data-source';
import { z } from 'zod';
import axios from 'axios';
import { getIntegrationApiKey } from '../workers/helpers/agents';

export class JulesProvider implements CloudProvider {
    slug = 'Jules';

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
            providerType: ProviderType.JULES,
            conversationId: 'jules',
            url: '',
            status: AgentStatus.PENDING,
            name: `Jules Agent${model ? ` (${model})` : ''}`,
            model: model || null,
        });
        await agentRepository.save(agent);

        const apiKey = await getIntegrationApiKey(userId, 'jules');

        const payload = {
            prompt: message,
            sourceContext: {
                source: `sources/github/${repositoryFullName}`,
                githubRepoContext: {
                    startingBranch: baseBranch,
                },
            },
        };

        try {
            const response = await axios.post('https://jules.googleapis.com/v1alpha/sessions', payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': apiKey,
                },
            });

            const responseSchema = z.object({
                name: z.string(),
                id: z.string(),
                url: z.string(),
            });

            const parsedResponse = responseSchema.safeParse(response.data);

            if (!parsedResponse.success) {
                agent.status = AgentStatus.FAILED;
                console.error('Jules API response parsing error:', parsedResponse.error);
                console.error('Response data:', response.data);
                return await agentRepository.save(agent);
            }

            agent.conversationId = parsedResponse.data.id;
            agent.url = parsedResponse.data.url;
            agent.status = AgentStatus.RUNNING;
            await agentRepository.save(agent);

            return agent;
        } catch (error) {
            agent.status = AgentStatus.FAILED;
            console.error('Jules provider agent creation error:', error);

            return await agentRepository.save(agent);
        }
    }

    async getMessages(agent: Agent) {
        const apiKey = await getIntegrationApiKey(agent.workspace.userId, 'jules');

        try {
            const [sessionResponse, activitiesResponse] = await Promise.all([
                axios.get(`https://jules.googleapis.com/v1alpha/sessions/${agent.conversationId}`, {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Goog-Api-Key': apiKey,
                    },
                }),
                axios.get(`https://jules.googleapis.com/v1alpha/sessions/${agent.conversationId}/activities?pageSize=30`, {
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Goog-Api-Key': apiKey,
                    },
                }),
            ]);

            const sessionSchema = z.object({
                name: z.string(),
                id: z.string(),
                createTime: z.string(),
                prompt: z.string(),
                state: z.string(),
            });

            const messagesSchema = z.object({
                name: z.string(),
                createTime: z.string(),
                originator: z.string(),
                agentMessaged: z.object({ agentMessage: z.string() }).optional(),
                userMessaged: z.object({ userMessage: z.string() }).optional(),
                id: z.string(),
            });

            const parsedSession = sessionSchema.safeParse(sessionResponse.data);
            const parsedMessages = z.array(messagesSchema).safeParse(activitiesResponse.data.activities || []);

            if (!parsedSession.success || !parsedMessages.success) {
                console.error('Jules API response parsing error:', {
                    session: parsedSession.success ? null : parsedSession.error,
                    messages: parsedMessages.success ? null : parsedMessages.error,
                });
                console.error('Response data:', {
                    session: sessionResponse.data,
                    messages: parsedMessages.data,
                });
                return [];
            }

            if (parsedSession.data.state === 'COMPLETED' && agent.status !== AgentStatus.COMPLETED) {
                agent.status = AgentStatus.COMPLETED;
                await AppDataSource.getRepository(Agent).save(agent);
            }

            const initialPrompt = {
                name: parsedSession.data.name,
                originator: 'user' as const,
                createTime: parsedSession.data.createTime,
                userMessaged: {
                    userMessage: parsedSession.data.prompt,
                },
                id: parsedSession.data.id,
            };

            const allMessages = [initialPrompt, ...parsedMessages.data];

            return allMessages
                .map((message, index) => {
                    let content = '';
                    let sender: 'USER' | 'AGENT' = message.originator === 'user' ? 'USER' : 'AGENT';

                    if ('userMessaged' in message && message.userMessaged) {
                        content = message.userMessaged.userMessage;
                        sender = 'USER';
                    } else if ('agentMessaged' in message && message.agentMessaged) {
                        content = message.agentMessaged.agentMessage;
                        sender = 'AGENT';
                    } else {
                        return null;
                    }

                    return {
                        id: index + 1,
                        created_at: new Date(message.createTime),
                        content,
                        sender,
                        tool_calls: [],
                    };
                })
                .filter((msg) => msg != null);
        } catch (error) {
            console.error('Jules provider getMessages error:', error instanceof Error ? error.message : '', 'Agent ID:', agent.id);
            return [];
        }
    }

    async sendMessage(agent: Agent, message: string): Promise<boolean> {
        const apiKey = await getIntegrationApiKey(agent.workspace.userId, 'jules');

        const payload = {
            prompt: message,
        };

        try {
            await axios.post(`https://jules.googleapis.com/v1alpha/sessions/${agent.conversationId}:sendMessage`, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Goog-Api-Key': apiKey,
                },
            });

            agent.status = AgentStatus.RUNNING;
            await AppDataSource.getRepository(Agent).save(agent);

            return true;
        } catch (error) {
            console.error('Jules provider sendMessage error:', error);
            return false;
        }
    }
}
