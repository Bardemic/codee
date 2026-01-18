'use step';

import { Sandbox } from '@vercel/sandbox';
import { PostHog } from 'posthog-node';
import { Agent } from '../db/entities/Agent';
import { Message } from '../db/entities/Message';
import { SubscriptionTier } from '../db/entities/Organization';
import { getACPClient } from '../utils/acp';
import { AGENT_SYSTEM_PROMPT, ORCHESTRATOR_AGENT_SYSTEM_PROMPT } from './prompts';

if (!process.env.POSTHOG_API_KEY) {
    throw new Error('POSTHOG_API_KEY is not set');
}

const anthropicAuthToken = process.env.ANTHROPIC_AUTH_TOKEN || process.env.OPENROUTER_API_KEY;
const hasAnthropicApiKey = Boolean(process.env.ANTHROPIC_API_KEY);

if (!hasAnthropicApiKey && !anthropicAuthToken) {
    throw new Error('ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN/OPENROUTER_API_KEY is not set');
}

if (anthropicAuthToken && !process.env.ANTHROPIC_BASE_URL) {
    throw new Error('ANTHROPIC_BASE_URL is required when using ANTHROPIC_AUTH_TOKEN or OPENROUTER_API_KEY');
}

export type TokenUsageAccumulator = {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
};

const DEFAULT_SONNET_MODEL = process.env.ANTHROPIC_DEFAULT_SONNET_MODEL || 'claude-sonnet-4.5';
const DEFAULT_OPUS_MODEL = process.env.ANTHROPIC_DEFAULT_OPUS_MODEL || 'claude-opus-4.1';
const DEFAULT_HAIKU_MODEL = process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL || 'claude-3-5-haiku-20241022';

export const AGENT_MODEL = DEFAULT_SONNET_MODEL;
export const ORCHESTRATOR_MODEL = DEFAULT_SONNET_MODEL;

export async function runAgentLLM(
    agentId: number,
    sandbox: Sandbox,
    toolSlugs: string[],
    previousMessages: Message[],
    usageAccumulator: TokenUsageAccumulator,
    subscriptionTier: SubscriptionTier
) {
    const phClient = new PostHog(process.env.POSTHOG_API_KEY!, { host: 'https://us.i.posthog.com' });

    // Get the ACP client for Claude Code
    const acpClient = getACPClient();
    await acpClient.initialize();

    // Create a new session for this agent run
    const sessionId = await acpClient.createSession(process.cwd());

    // Get the last user message
    const lastUserMessage = previousMessages.filter((m) => m.sender === 'USER').pop();
    const userImages = lastUserMessage?.images || [];

    // Send the message with history and system prompt
    const result = await acpClient.sendMessageWithHistory(
        lastUserMessage?.content || '',
        userImages,
        previousMessages.slice(0, -1), // All messages except the last one
        AGENT_SYSTEM_PROMPT,
        (update) => {
            // Stream updates via PostHog
            phClient.capture({
                event: 'agent_update',
                distinctId: `agent_${agentId}`,
                properties: {
                    updateType: update.update.sessionUpdate,
                    sessionId,
                },
            });

            // Track token usage if available
            // Note: ACP doesn't provide token usage in the same way, so we'll estimate
            if (update.update.sessionUpdate === 'agent_message_chunk') {
                usageAccumulator.completionTokens += 10; // Rough estimate
                usageAccumulator.totalTokens += 10;
            }
        }
    );

    await phClient.shutdown();

    return {
        final: result.text,
        steps: [], // ACP doesn't provide steps in the same format
        model: AGENT_MODEL,
    };
}

export async function runOrchestratorAgentLLM(
    agent: Agent,
    sandbox: Sandbox,
    toolSlugs: string[],
    previousMessages: Message[],
    usageAccumulator: TokenUsageAccumulator
) {
    const phClient = new PostHog(process.env.POSTHOG_API_KEY!, { host: 'https://us.i.posthog.com' });

    // Get the ACP client for Claude Code
    const acpClient = getACPClient();
    await acpClient.initialize();

    // Create a new session for this orchestrator run
    const sessionId = await acpClient.createSession(process.cwd());

    // Get the last user message
    const lastUserMessage = previousMessages.filter((m) => m.sender === 'USER').pop();
    const userImages = lastUserMessage?.images || [];

    // Send the message with history and system prompt
    const result = await acpClient.sendMessageWithHistory(
        lastUserMessage?.content || '',
        userImages,
        previousMessages.slice(0, -1), // All messages except the last one
        ORCHESTRATOR_AGENT_SYSTEM_PROMPT,
        (update) => {
            // Stream updates via PostHog
            phClient.capture({
                event: 'orchestrator_update',
                distinctId: `agent_${agent.id}`,
                properties: {
                    updateType: update.update.sessionUpdate,
                    sessionId,
                },
            });

            // Track token usage if available
            if (update.update.sessionUpdate === 'agent_message_chunk') {
                usageAccumulator.completionTokens += 10; // Rough estimate
                usageAccumulator.totalTokens += 10;
            }
        }
    );

    await phClient.shutdown();

    return {
        final: result.text,
        steps: [], // ACP doesn't provide steps in the same format
        model: ORCHESTRATOR_MODEL,
    };
}
