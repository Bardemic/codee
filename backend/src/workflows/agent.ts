'use workflow';

import { generateText, stepCountIs, type ModelMessage } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { withTracing } from '@posthog/ai';
import { Sandbox } from '@vercel/sandbox';
import { Agent, AgentStatus } from '../db/entities/Agent';
import { sandboxTools } from '../tools/sandboxTools';
import { emitDone, emitError, emitStatus } from '../stream/events';
import { buildDynamicTools } from '../tools/dynamic';
import { getAgentById, saveMessage, saveAgentActivity, updateAgent } from '../workers/helpers/agents';
import { commitAndPush, generateBranchName, getGithubTokenForUser } from '../workers/helpers/github';
import { createSandbox } from '../workers/helpers/sandbox';
import { AppDataSource } from '../db/data-source';
import { Message } from '../db/entities/Message';
import { buildOrchestratorAgentTools } from '../tools/primaryAgent';
import { PostHog } from 'posthog-node';

export type AgentJobPayload = {
    agentId: number;
    prompt: string;
    repositoryFullName?: string;
    toolSlugs?: string[];
    baseBranch: string;
    isOrchestratorAgent: boolean;
};

if (!process.env.POSTHOG_API_KEY) {
    throw new Error('POSTHOG_API_KEY is not set');
}

const AGENT_SYSTEM_PROMPT = `
You are Codee, an asynchronous coding agent. You work on GitHub repositories, read code, make changes, and explain your steps succinctly.
If the user requests git operations, prefer using tools (update_file, list_files, read_file, grep).
Avoid destructive operations. Return concise reasoning and resulting changes.
`;

const ORCHESTRATOR_AGENT_SYSTEM_PROMPT = `
You are the primary agent of a coding agent, Codee. Codee is an Asynchronous
coding agent platform, which allows users to create and manage coding agents. They can enter a prompt, select their repository,
then select from providers for a coding agent, as well as different models/amounts of agents (for example, a user may request 3
agents on Codee, 2 on Cursor, 1 on Google Jules). Users could also select a different variety of tools. For example, a user could connect their
data insight platform, then select an "errors" tool, which gives insight on their errors from that service.

Users also have the option to opt for a "primary agent." Rather than selecting many providers, primary agents only run on Codee.
The goal of a primary agent isn't the same as a typical agent. A primary agent is an orchestrator, taking the user's request, and
spawning agents with their own prompts and goals. The primary agent should spend a long time thinking, planning, etc. If given tools that
relate to the request, the agent should utilize them to understand the request better, gain more context, etc. example: If a user prompts
to add the 3 most requested features to a repository, and selects some tool that gets user requests, the primary agent should use that tool
to figure out what the 3 most requested features are, then spawn 3 agents to add those features.

The sub agents do not have any context between one another. They are completely independent. The goal is to have independent code, solutions, etc.

You are the primary agent for the user in this case. You should spend a long time thinking, planning, etc. If given tools that relate to the request,
use those tools. At the very end, you should spawn a number of agents to help you with the request. This is not the time to elicit feedback from the user.
A user will only use a primary agent in order to have a lot of thinking done for other sub agents to be created. Under no circumstances should you finish a conversation
without creating sub agents, unless there is truly no further work to be done relating to the request.
`;

async function loadAgent(agentId: number) {
    'use step';
    const agent = await getAgentById(agentId);
    if (!agent) throw new Error('agent not found');
    return agent;
}

async function validateAndGetToken(agent: Agent, repositoryFullName: string | undefined, baseBranch: string) {
    'use step';
    const repoName = repositoryFullName || agent.workspace.githubRepositoryName;
    if (!repoName) {
        await emitError(agent.id, 'missing_repository', 'No repository specified', 'agent_init');
        throw new Error('No repository specified');
    }

    const token = await getGithubTokenForUser(agent.workspace.userId);
    if (!token) {
        await emitError(agent.id, 'github_token_missing', 'GitHub token missing', 'agent_init');
        throw new Error('GitHub token missing');
    }

    return { repositoryFullName: repoName, baseBranch, token };
}

async function prepareSandbox(agent: Agent, token: string, repositoryFullName: string, baseBranch: string) {
    'use step';
    await emitStatus(agent.id, 'starting', 'agent_init', 'preparing sandbox');

    try {
        const sandbox = await createSandbox(agent, token, repositoryFullName, baseBranch);
        return sandbox;
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to create sandbox';
        await emitError(agent.id, 'sandbox_creation_failed', message, 'agent_init');
        throw err;
    }
}

function createReasoningStreamer(agentId: number) {
    return (step: { reasoningText?: string; reasoning?: ReadonlyArray<{ text?: string | null }> }) => {
        const reasoningText = (step.reasoningText ?? step.reasoning?.map((part) => part.text ?? '').join('\n') ?? '').trim();
        if (!reasoningText) return;
        emitStatus(agentId, 'running', 'reasoning', reasoningText).catch((error) => {
            console.warn('Failed to emit reasoning status:', error);
        });
    };
}

function transformMessagesToModelMessages(previousMessages: Message[]): ModelMessage[] {
    return previousMessages.map<ModelMessage>((message) => {
        if (message.sender === 'USER' && message.images.length > 0) {
            const content: Array<{ type: 'text'; text: string } | { type: 'image'; image: string; mimeType?: string }> = [
                { type: 'text', text: message.content },
            ];
            for (const image of message.images) {
                content.push({
                    type: 'image',
                    image: image.data,
                    mimeType: image.mimeType,
                });
            }
            return {
                role: 'user',
                content,
            };
        }
        return {
            role: message.sender === 'USER' ? 'user' : 'assistant',
            content: message.content,
        };
    });
}

async function runAgentLLM(agentId: number, sandbox: Sandbox, toolSlugs: string[], previousMessages: Message[]) {
    'use step';

    const phClient = new PostHog(process.env.POSTHOG_API_KEY!, { host: 'https://us.i.posthog.com' });
    const openaiClient = createOpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });
    const model = withTracing(openaiClient('gpt-5-mini'), phClient, { posthogTraceId: `agent_${agentId}` });

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

async function runOrchestratorAgentLLM(agent: Agent, sandbox: Sandbox, toolSlugs: string[], previousMessages: Message[]) {
    'use step';

    const phClient = new PostHog(process.env.POSTHOG_API_KEY!, { host: 'https://us.i.posthog.com' });
    const openaiClient = createOpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });
    const model = withTracing(openaiClient('gpt-5-mini'), phClient, { posthogTraceId: `agent_${agent.id}` });

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

async function loadPreviousMessages(agentId: number) {
    'use step';
    return await AppDataSource.getRepository(Message).find({
        where: { agent: { id: agentId } },
        order: { createdAt: 'ASC' },
    });
}

async function createBranchIfNeeded(agent: Agent, sandbox: Sandbox, isOrchestratorAgent: boolean) {
    'use step';
    if (isOrchestratorAgent) {
        return null;
    }

    if (!agent.githubBranchName) {
        // Create new branch for first-time agent
        const branchName = generateBranchName({ title: agent.workspace.name, agentId: agent.id });
        await emitStatus(agent.id, 'running', 'agent_create_branch', `creating branch ${branchName}`);
        await sandbox.runCommand({
            cmd: 'git',
            args: ['checkout', '-b', branchName],
        });
        await sandbox.runCommand({
            cmd: 'git',
            args: ['push', '-u', 'origin', branchName],
        });
        await updateAgent(agent, { githubBranchName: branchName });
        await emitStatus(agent.id, 'running', 'agent_branch_created', branchName);
        return branchName;
    }

    // Checkout existing branch for follow-up messages
    await emitStatus(agent.id, 'running', 'agent_checkout_branch', `checking out branch ${agent.githubBranchName}`);
    await sandbox.runCommand({
        cmd: 'git',
        args: ['checkout', agent.githubBranchName],
    });
    return agent.githubBranchName;
}

async function saveAgentResponse(agent: Agent, response: { final: string; steps: any[] }) {
    'use step';
    const savedMessage = await saveMessage(agent, response.final, 'AGENT');
    await saveAgentActivity(agent, savedMessage, response.steps);
    return savedMessage;
}

async function commitChangesIfNeeded(sandbox: Sandbox, agentId: number, prompt: string) {
    'use step';
    const statusResult = await sandbox.runCommand({
        cmd: 'git',
        args: ['status', '--porcelain'],
    });
    const hasChanges = (await statusResult.stdout()).trim().length > 0;
    if (hasChanges) {
        await emitStatus(agentId, 'running', 'agent_commit', 'committing changes');
        const commitMessage = `Codee: ${prompt.slice(0, 50)}${prompt.length > 50 ? '...' : ''}`;
        await commitAndPush(sandbox, commitMessage);
    }
}

async function cleanupSandbox(sandbox: Sandbox) {
    'use step';
    await sandbox.stop();
}

async function markAgentComplete(agentId: number) {
    'use step';
    const agent = await getAgentById(agentId);
    if (!agent) throw new Error('agent not found');
    await Promise.all([updateAgent(agent, { status: AgentStatus.COMPLETED }), emitDone(agentId, 'success')]);
}

async function markAgentFailed(agentId: number, error: unknown) {
    'use step';
    const agent = await getAgentById(agentId);
    if (!agent) return;
    const message = error instanceof Error ? error.message : 'unknown error';
    await emitError(agentId, 'agent_failure', message, 'execute');
    await updateAgent(agent, { status: AgentStatus.FAILED });
}

export async function runOrchestratorAgentWorkflow(payload: AgentJobPayload) {
    'use workflow';

    let sandbox: Sandbox | undefined;

    try {
        const agent = await loadAgent(payload.agentId);
        const { repositoryFullName, baseBranch, token } = await validateAndGetToken(agent, payload.repositoryFullName, payload.baseBranch);

        sandbox = await prepareSandbox(agent, token, repositoryFullName, baseBranch);

        const previousMessages = await loadPreviousMessages(payload.agentId);

        await Promise.all([
            emitStatus(agent.id, 'running', 'agent_orchestrator_start', 'running orchestrator agent'),
            updateAgent(agent, { status: AgentStatus.RUNNING }),
        ]);

        const response = await runOrchestratorAgentLLM(agent, sandbox, payload.toolSlugs || [], previousMessages);

        await saveAgentResponse(agent, response);

        await cleanupSandbox(sandbox);

        await markAgentComplete(agent.id);
    } catch (error: unknown) {
        if (sandbox) {
            try {
                await cleanupSandbox(sandbox);
            } catch {
                // Ignore cleanup errors
            }
        }
        await markAgentFailed(payload.agentId, error);
        throw error;
    }
}

export async function runAgentWorkflow(payload: AgentJobPayload) {
    'use workflow';

    let sandbox: Sandbox | undefined;

    try {
        const agent = await loadAgent(payload.agentId);
        const { repositoryFullName, baseBranch, token } = await validateAndGetToken(agent, payload.repositoryFullName, payload.baseBranch);

        sandbox = await prepareSandbox(agent, token, repositoryFullName, baseBranch);

        await createBranchIfNeeded(agent, sandbox, payload.isOrchestratorAgent);

        const previousMessages = await loadPreviousMessages(payload.agentId);

        await Promise.all([
            emitStatus(agent.id, 'running', 'sandboxagent_starting', 'running AI'),
            updateAgent(agent, { status: AgentStatus.RUNNING }),
        ]);

        const response = await runAgentLLM(agent.id, sandbox, payload.toolSlugs || [], previousMessages);

        await saveAgentResponse(agent, response);

        if (payload.isOrchestratorAgent) {
            await cleanupSandbox(sandbox);
            await markAgentComplete(agent.id);
            return;
        }

        await commitChangesIfNeeded(sandbox, agent.id, payload.prompt);

        await cleanupSandbox(sandbox);

        await markAgentComplete(agent.id);
    } catch (error: unknown) {
        if (sandbox) {
            try {
                await cleanupSandbox(sandbox);
            } catch {
                // Ignore cleanup errors
            }
        }
        await markAgentFailed(payload.agentId, error);
        throw error;
    }
}
