'use step';

import { generateText, stepCountIs } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { withTracing } from '@posthog/ai';
import { Sandbox } from '@vercel/sandbox';
import { PostHog } from 'posthog-node';
import { Agent } from '../db/entities/Agent';
import { Message } from '../db/entities/Message';
import { SubscriptionTier } from '../db/entities/Organization';
import { sandboxTools } from '../tools/sandboxTools';
import { buildDynamicTools } from '../tools/dynamic';
import { buildOrchestratorAgentTools } from '../tools/primaryAgent';
import { buildBrowserTools, type SandboxUrl } from '../tools/kernel/index';
import { DEFAULT_BROWSER_PORTS } from './helpers/sandbox';
import { createReasoningStreamer } from '../stream/events';
import { transformMessagesToModelMessages } from '../utils/llm';
import { AGENT_SYSTEM_PROMPT, ORCHESTRATOR_AGENT_SYSTEM_PROMPT } from './prompts';
import { createGeminiProvider } from 'ai-sdk-provider-gemini-cli';

if (!process.env.POSTHOG_API_KEY) {
    throw new Error('POSTHOG_API_KEY is not set');
}

export type TokenUsageAccumulator = {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
};

export const AGENT_MODEL = 'gpt-5-mini';
export const ORCHESTRATOR_MODEL = 'gpt-5-mini';

export async function runAgentLLM(
    agentId: number,
    sandbox: Sandbox,
    toolSlugs: string[],
    previousMessages: Message[],
    usageAccumulator: TokenUsageAccumulator,
    subscriptionTier: SubscriptionTier
) {
    const phClient = new PostHog(process.env.POSTHOG_API_KEY!, { host: 'https://us.i.posthog.com' });
    const openaiClient = createOpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });
    const model = withTracing(openaiClient(AGENT_MODEL), phClient, { posthogTraceId: `agent_${agentId}_${previousMessages.length}` });

    const tools = sandboxTools(agentId, sandbox);
    const dynamicTools = await buildDynamicTools(agentId, toolSlugs, sandbox);

    // Browser tools are included as base tools for non-free users
    const hasBrowserAccess = subscriptionTier !== SubscriptionTier.FREE;
    const browserTools = hasBrowserAccess
        ? buildBrowserTools({
              agentId,
              sandboxUrls: DEFAULT_BROWSER_PORTS.map((port): SandboxUrl => ({ port, url: sandbox.domain(port) })),
          })
        : {};

    const messages = transformMessagesToModelMessages(previousMessages);
    const streamReasoning = createReasoningStreamer(agentId);

    const result = await generateText({
        model,
        providerOptions: {
            openai: {
                reasoningEffort: 'high',
                reasoningSummary: 'detailed',
            },
        },
        system: AGENT_SYSTEM_PROMPT,
        messages,
        tools: { ...tools, ...dynamicTools, ...browserTools },
        stopWhen: stepCountIs(32),
        onStepFinish: (step) => {
            streamReasoning(step);
            usageAccumulator.promptTokens += step.usage.inputTokens || 0;
            usageAccumulator.completionTokens += step.usage.outputTokens || 0;
            usageAccumulator.totalTokens += step.usage.totalTokens || 0;
        },
    });

    await phClient.shutdown();

    return {
        final: result.text,
        steps: result.steps,
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
    const openaiClient = createOpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });
    const model = withTracing(openaiClient(ORCHESTRATOR_MODEL), phClient, { posthogTraceId: `agent_${agent.id}_${previousMessages.length}` });

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

    // Browser tools are included as base tools for non-free users
    const subscriptionTier = agent.workspace.organization?.subscriptionTier ?? SubscriptionTier.FREE;
    const hasBrowserAccess = subscriptionTier !== SubscriptionTier.FREE;
    const browserTools = hasBrowserAccess
        ? buildBrowserTools({
              agentId: agent.id,
              sandboxUrls: DEFAULT_BROWSER_PORTS.map((port): SandboxUrl => ({ port, url: sandbox.domain(port) })),
          })
        : {};

    const messages = transformMessagesToModelMessages(previousMessages);
    const streamReasoning = createReasoningStreamer(agent.id);

    const result = await generateText({
        model,
        providerOptions: {
            openai: {
                reasoningEffort: 'high',
                reasoningSummary: 'concise',
            },
        },
        system: ORCHESTRATOR_AGENT_SYSTEM_PROMPT,
        messages,
        tools: { ...orchestratorAgentTools, ...dynamicTools, ...tools, ...browserTools },
        stopWhen: stepCountIs(32),
        onStepFinish: (step) => {
            streamReasoning(step);
            usageAccumulator.promptTokens += step.usage.inputTokens || 0;
            usageAccumulator.completionTokens += step.usage.outputTokens || 0;
            usageAccumulator.totalTokens += step.usage.totalTokens || 0;
        },
    });

    await phClient.shutdown();

    return {
        final: result.text,
        steps: result.steps,
        model: ORCHESTRATOR_MODEL,
    };
}
