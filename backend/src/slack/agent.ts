import { generateText, stepCountIs } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import axios from 'axios';
import { AppDataSource } from '../db/data-source';
import { IntegrationConnection } from '../db/entities/IntegrationConnection';
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

    try {
        const tools = createSlackTools(userId);

        const result = await generateText({
            model: openaiClient('gpt-5-nano'),
            system: `You are Codee, an async coding agent assistant. You help users manage their workspaces, agents, repositories, and integrations through Slack.

When users ask about workspaces, agents, repositories, or integrations, use the available tools to fetch the information.

Be concise and helpful. Format your responses clearly for Slack messages.`,
            prompt: cleanedText,
            tools,
            stopWhen: stepCountIs(5),
        });

        await sendSlackMessage({
            token: accessToken,
            channel,
            text: result.text,
            threadTs: messageTs,
        });
    } catch (error) {
        console.error('Error processing Slack message:', error);
        await sendSlackMessage({
            token: accessToken,
            channel,
            text: 'Sorry, I encountered an error processing your request. Please try again later.',
            threadTs: messageTs,
        });
    }
}

async function sendSlackMessage({ token, channel, text, threadTs }: { token: string; channel: string; text: string; threadTs?: string }) {
    try {
        await axios.post(
            'https://slack.com/api/chat.postMessage',
            {
                channel,
                text,
                thread_ts: threadTs,
            },
            {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
            }
        );
    } catch (error) {
        console.error('Failed to send Slack message:', error);
        throw error;
    }
}
