'use step';

import { generateText, stepCountIs, type StepResult, type ToolSet } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { withTracing } from '@posthog/ai';
import { Sandbox } from '@vercel/sandbox';
import { PostHog } from 'posthog-node';
import { Agent } from '../db/entities/Agent';
import { Message } from '../db/entities/Message';
import { sandboxTools } from '../tools/sandboxTools';
import { buildDynamicTools } from '../tools/dynamic';
import { buildOrchestratorAgentTools } from '../tools/primaryAgent';
import { createReasoningStreamer } from '../stream/events';
import { transformMessagesToModelMessages } from '../utils/llm';
import { AGENT_SYSTEM_PROMPT, ORCHESTRATOR_AGENT_SYSTEM_PROMPT } from './prompts';

if (!process.env.POSTHOG_API_KEY) {
    throw new Error('POSTHOG_API_KEY is not set');
}

export async function runAgentLLM(agentId: number, sandbox: Sandbox, toolSlugs: string[], previousMessages: Message[]) {
    const phClient = new PostHog(process.env.POSTHOG_API_KEY!, { host: 'https://us.i.posthog.com' });
    const openaiClient = createOpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });
    const model = withTracing(openaiClient('gpt-5-mini'), phClient, { posthogTraceId: `agent_${agentId}_${previousMessages.length}` });

    const tools = sandboxTools(agentId, sandbox);
    const dynamicTools = await buildDynamicTools(agentId, toolSlugs, sandbox);
    const messages = transformMessagesToModelMessages(previousMessages);
    const streamReasoning = createReasoningStreamer(agentId);

    const result = await generateText({
        model,
        providerOptions: {
            openai: {
                reasoningEffort: 'medium',
                reasoningSummary: 'concise',
            },
        },
        system: AGENT_SYSTEM_PROMPT,
        messages,
        tools: { ...tools, ...dynamicTools },
        stopWhen: stepCountIs(32),
        onStepFinish: streamReasoning,
    });

    await phClient.shutdown();

    return {
        final: result.text,
        steps: result.steps,
    };
}

export async function runOrchestratorAgentLLM(agent: Agent, sandbox: Sandbox, toolSlugs: string[], previousMessages: Message[]) {
    const phClient = new PostHog(process.env.POSTHOG_API_KEY!, { host: 'https://us.i.posthog.com' });
    const openaiClient = createOpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });
    const model = withTracing(openaiClient('gpt-5-mini'), phClient, { posthogTraceId: `agent_${agent.id}_${previousMessages.length}` });

    const tools = sandboxTools(agent.id, sandbox);
    const userImages = previousMessages.filter((message) => message.sender === 'USER').flatMap((message) => message.images);
    const orchestratorAgentTools = buildOrchestratorAgentTools({
        agentId: agent.id,
        userId: agent.workspace.userId,
        workspace: agent.workspace,
        repositoryFullName: agent.workspace.githubRepositoryName,
        baseBranch: agent.workspace.currentBranch,
        toolSlugs,
        images: userImages,
    });
    const dynamicTools = await buildDynamicTools(agent.id, toolSlugs, sandbox);
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
        tools: { ...orchestratorAgentTools, ...dynamicTools, ...tools },
        stopWhen: stepCountIs(32),
        onStepFinish: streamReasoning,
    });

    await phClient.shutdown();

    return {
        final: result.text,
        steps: result.steps,
    };
}
