'use step';

import { Sandbox } from '@vercel/sandbox';
import { PostHog } from 'posthog-node';
import { Agent } from '../db/entities/Agent';
import { Message } from '../db/entities/Message';
import { SubscriptionTier } from '../db/entities/Organization';
import { getAnthropicClient, AnthropicClient } from '../utils/anthropic';
import { sandboxTools } from '../tools/sandboxTools';
import { buildDynamicTools } from '../tools/dynamic';
import { buildOrchestratorAgentTools } from '../tools/primaryAgent';
import { buildBrowserTools, type SandboxUrl } from '../tools/kernel/index';
import { DEFAULT_BROWSER_PORTS } from './helpers/sandbox';
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

const DEFAULT_SONNET_MODEL = process.env.ANTHROPIC_DEFAULT_SONNET_MODEL || 'claude-sonnet-4-5-20250929';
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
    const anthropicClient = getAnthropicClient();

    // Build tools
    const tools = sandboxTools(agentId, sandbox);
    const dynamicTools = await buildDynamicTools(agentId, toolSlugs, sandbox);

    // Browser tools are included for non-free users
    const hasBrowserAccess = subscriptionTier !== SubscriptionTier.FREE;
    const browserTools = hasBrowserAccess
        ? buildBrowserTools({
              agentId,
              sandboxUrls: DEFAULT_BROWSER_PORTS.map((port): SandboxUrl => ({ port, url: sandbox.domain(port) })),
          })
        : {};

    const allTools = { ...tools, ...dynamicTools, ...browserTools };

    // Transform previous messages to Anthropic format
    const messages = AnthropicClient.transformMessages(previousMessages);

    // Run the agent with automatic tool calling
    const result = await anthropicClient.runWithTools({
        messages,
        tools: allTools,
        system: AGENT_SYSTEM_PROMPT,
        model: AGENT_MODEL,
        maxTokens: 4096,
        maxIterations: 32,
        onUpdate: (event) => {
            // Stream updates via PostHog
            phClient.capture({
                event: 'agent_update',
                distinctId: `agent_${agentId}`,
                properties: {
                    eventType: event.type,
                    ...event,
                },
            });
        },
    });

    // Accumulate token usage
    usageAccumulator.promptTokens += result.totalUsage.inputTokens;
    usageAccumulator.completionTokens += result.totalUsage.outputTokens;
    usageAccumulator.totalTokens += result.totalUsage.inputTokens + result.totalUsage.outputTokens;

    await phClient.shutdown();

    return {
        final: result.finalText,
        steps: [], // Anthropic doesn't provide steps in the same format
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
    const anthropicClient = getAnthropicClient();

    // Build tools
    const tools = sandboxTools(agent.id, sandbox);
    const userImages = previousMessages.filter((message) => message.sender === 'USER').flatMap((message) => message.images);
    const orchestratorAgentTools = buildOrchestratorAgentTools({
        agentId: agent.id,
        organizationId: agent.workspace.organizationId,
        workspace: agent.workspace,
        repositoryFullName: agent.workspace.githubRepositoryName,
        baseBranch: agent.workspace.currentBranch,
        toolSlugs,
        images: userImages,
    });
    const dynamicTools = await buildDynamicTools(agent.id, toolSlugs, sandbox);

    // Browser tools are included for non-free users
    const subscriptionTier = agent.workspace.organization?.subscriptionTier ?? SubscriptionTier.FREE;
    const hasBrowserAccess = subscriptionTier !== SubscriptionTier.FREE;
    const browserTools = hasBrowserAccess
        ? buildBrowserTools({
              agentId: agent.id,
              sandboxUrls: DEFAULT_BROWSER_PORTS.map((port): SandboxUrl => ({ port, url: sandbox.domain(port) })),
          })
        : {};

    const allTools = { ...orchestratorAgentTools, ...dynamicTools, ...tools, ...browserTools };

    // Transform previous messages to Anthropic format
    const messages = AnthropicClient.transformMessages(previousMessages);

    // Run the orchestrator with automatic tool calling
    const result = await anthropicClient.runWithTools({
        messages,
        tools: allTools,
        system: ORCHESTRATOR_AGENT_SYSTEM_PROMPT,
        model: ORCHESTRATOR_MODEL,
        maxTokens: 4096,
        maxIterations: 32,
        onUpdate: (event) => {
            // Stream updates via PostHog
            phClient.capture({
                event: 'orchestrator_update',
                distinctId: `agent_${agent.id}`,
                properties: {
                    eventType: event.type,
                    ...event,
                },
            });
        },
    });

    // Accumulate token usage
    usageAccumulator.promptTokens += result.totalUsage.inputTokens;
    usageAccumulator.completionTokens += result.totalUsage.outputTokens;
    usageAccumulator.totalTokens += result.totalUsage.inputTokens + result.totalUsage.outputTokens;

    await phClient.shutdown();

    return {
        final: result.finalText,
        steps: [], // Anthropic doesn't provide steps in the same format
        model: ORCHESTRATOR_MODEL,
    };
}
