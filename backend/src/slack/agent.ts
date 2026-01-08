import { generateText, stepCountIs } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import axios from 'axios';
import { AppDataSource } from '../db/data-source';
import { IntegrationConnection } from '../db/entities/IntegrationConnection';
import { Workspace } from '../db/entities/Workspace';
import { createSlackTools } from './tools';

const openaiClient = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

interface ProcessMessageParams {
    userId: string;
    channel: string;
    text: string;
    messageTs: string;
}

export async function processSlackMessage({ userId, channel, text, messageTs }: ProcessMessageParams) {
    const connectionRepository = AppDataSource.getRepository(IntegrationConnection);
    const connection = await connectionRepository.findOne({
        where: { userId, provider: { slug: 'slack' } },
        relations: ['provider'],
    });

    if (!connection) {
        console.error('No Slack connection found for user');
        return;
    }

    const config = connection.getDataConfig();
    const accessToken = config.access_token;

    if (!accessToken) {
        console.error('No Slack access token found');
        return;
    }

    const cleanedText = text.replace(/<@[A-Z0-9]+>/g, '').trim();

    let reactionAdded = false;
    try {
        reactionAdded = await addSlackReaction({
            token: accessToken,
            channel,
            messageTs,
            name: 'hourglass_flowing_sand',
        });

        const tools = createSlackTools(userId, channel);

        const result = await generateText({
            model: openaiClient('gpt-5-nano'),
            system: `You are Codee, an async coding agent that creates workspaces with AI agents to complete coding tasks.

CRITICAL RULES:
1. If the user asks you to modify code, add a feature, fix a bug, or make ANY changes to a codebase - you MUST create a workspace using the createWorkspace tool. NEVER give advice or instructions. ALWAYS create a workspace.
2. If the user asks to list workspaces, repos, integrations, etc - use the appropriate listing tools.
3. If the user asks for help - use the help tool.

When creating workspaces:
1. Call listRepositories to get available repos
2. Pick the repository mentioned by the user, or the most relevant one
3. Use empty tool_slugs: []
4. Use default provider_config: [{"name":"Codee","agents":[{}]}]
5. For "prompt", use the user's EXACT original message verbatim
6. Call createWorkspace immediately
7. Respond with ONLY the "formatted_message" from the result. No extra text.

You are NOT a coding assistant that gives advice. You CREATE WORKSPACES with agents that do the work.`,
            prompt: cleanedText,
            tools,
            stopWhen: stepCountIs(20),
        });

        const workspaceResult = result.steps.flatMap((step) => step.toolResults).find((toolResult) => toolResult.toolName === 'createWorkspace')?.output as
            | { workspace_id?: Workspace['id']; formatted_message?: string }
            | undefined;

        const messageToSend = workspaceResult?.formatted_message ?? result.text;
        const workspaceId = workspaceResult?.workspace_id ?? null;

        const sentMessageTs = await sendSlackMessage({
            token: accessToken,
            channel,
            text: messageToSend,
            threadTs: messageTs,
        });

        if (sentMessageTs && workspaceId) {
            const workspaceRepository = AppDataSource.getRepository(Workspace);
            await workspaceRepository.update(workspaceId, { slackMessageTs: sentMessageTs });
        }
    } catch (error) {
        console.error('Error processing Slack message:', error);
        await sendSlackMessage({
            token: accessToken,
            channel,
            text: 'Sorry, I encountered an error processing your request. Please try again later.',
            threadTs: messageTs,
        });
    } finally {
        if (reactionAdded) {
            try {
                await removeSlackReaction({
                    token: accessToken,
                    channel,
                    messageTs,
                    name: 'hourglass_flowing_sand',
                });
            } catch (error) {
                console.error('Failed to remove Slack reaction:', error);
            }
        }

        try {
            await addSlackReaction({
                token: accessToken,
                channel,
                messageTs,
                name: 'white_check_mark',
            });
        } catch (error) {
            console.error('Failed to add completion reaction:', error);
        }
    }
}

async function sendSlackMessage({
    token,
    channel,
    text,
    threadTs,
}: {
    token: string;
    channel: string;
    text: string;
    threadTs?: string;
}): Promise<string | null> {
    try {
        const response = await axios.post(
            'https://slack.com/api/chat.postMessage',
            {
                channel,
                text,
                thread_ts: threadTs,
                mrkdwn: true,
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            }
        );
        return response.data.ts || null;
    } catch (error) {
        console.error('Failed to send Slack message:', error);
        throw error;
    }
}

async function addSlackReaction({ token, channel, messageTs, name }: { token: string; channel: string; messageTs: string; name: string }): Promise<boolean> {
    try {
        const response = await axios.post(
            'https://slack.com/api/reactions.add',
            {
                channel,
                name,
                timestamp: messageTs,
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            }
        );
        if (!response.data?.ok) {
            console.error('Slack reaction add failed:', response.data);
        }
        return Boolean(response.data?.ok);
    } catch (error) {
        console.error('Failed to add Slack reaction:', error);
        return false;
    }
}

async function removeSlackReaction({ token, channel, messageTs, name }: { token: string; channel: string; messageTs: string; name: string }): Promise<void> {
    const response = await axios.post(
        'https://slack.com/api/reactions.remove',
        {
            channel,
            name,
            timestamp: messageTs,
        },
        {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        }
    );
    if (!response.data?.ok) {
        console.error('Slack reaction remove failed:', response.data);
    }
}
