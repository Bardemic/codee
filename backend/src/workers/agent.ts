import { generateText, stepCountIs, type ModelMessage } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { withTracing } from '@posthog/ai';
import { Sandbox } from '@vercel/sandbox';
import { Agent, AgentStatus } from '../db/entities/Agent';
import { sandboxTools } from '../tools/sandboxTools';
import { emitDone, emitError, emitStatus } from '../stream/events';
import type { AgentJobPayload } from './queue';
import { buildDynamicTools } from '../tools/dynamic';
import { getAgentById, saveMessage, updateAgent, persistToolCallsFromRedis } from './helpers/agents';
import { commitAndPush, generateBranchName, getGithubTokenForUser } from './helpers/github';
import { createSandbox } from './helpers/sandbox';
import { AppDataSource } from '../db/data-source';
import { Message } from '../db/entities/Message';
import { buildOrchestratorAgentTools } from '../tools/primaryAgent';
import { PostHog } from 'posthog-node';

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
data insight platform, then select an "errors" tool, which gives you access to tools that give insight on their errors from that service.

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
async function runAgentLLM(agentId: number, sandbox: Sandbox, toolSlugs: string[], previousMessages: Message[]) {
    const tools = sandboxTools(agentId, sandbox);
    const dynamicTools = await buildDynamicTools(agentId, toolSlugs, sandbox);
    const messages: ModelMessage[] = [
        ...previousMessages.map<ModelMessage>((message) => ({
            role: message.sender === 'USER' ? 'user' : 'assistant',
            content: message.content,
        })),
    ];

    if (!process.env.POSTHOG_API_KEY) {
        throw new Error('POSTHOG_API_KEY is not set');
    }
    const phClient = new PostHog(process.env.POSTHOG_API_KEY, { host: 'https://us.i.posthog.com' });

    const openaiClient = createOpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });

    const model = (agentId: number) => withTracing(openaiClient('gpt-5-nano'), phClient, { posthogTraceId: `agent_${agentId}` });

    const result = await generateText({
        model: model(agentId),
        providerOptions: {
            openai: {
                //temp, for testing
                reasoningEffort: 'minimal',
            },
        },
        system: AGENT_SYSTEM_PROMPT,
        messages,
        tools: { ...tools, ...dynamicTools },
        stopWhen: stepCountIs(32),
    });

    phClient.shutdown();

    return {
        final: result.text,
        toolCalls: result.toolCalls,
    };
}

async function runOrchestratorAgentLLM(agent: Agent, sandbox: Sandbox, toolSlugs: string[], prompt: string) {
    const tools = sandboxTools(agent.id, sandbox);
    const orchestratorAgentTools = buildOrchestratorAgentTools({
        userId: agent.workspace.userId,
        workspace: agent.workspace,
        repositoryFullName: agent.workspace.githubRepositoryName,
        baseBranch: agent.workspace.currentBranch,
        toolSlugs,
    });
    const dynamicTools = await buildDynamicTools(agent.id, toolSlugs, sandbox);
    const messages: ModelMessage[] = [
        {
            role: 'user',
            content: prompt,
        },
    ];

    const phClient = new PostHog('phc_hwsFXPoCm2g7kx1lteYlsDzOpUbPT5UETQV4WTyxnjs', { host: 'https://us.i.posthog.com' });

    const openaiClient = createOpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });

    const model = (agentId: number) => withTracing(openaiClient('gpt-5-nano'), phClient, { posthogTraceId: `agent_${agentId}` });

    const result = await generateText({
        model: model(agent.id),
        providerOptions: {
            openai: {
                //temp, for testing
                reasoningEffort: 'high',
            },
        },
        system: ORCHESTRATOR_AGENT_SYSTEM_PROMPT,
        messages,
        tools: { ...orchestratorAgentTools, ...dynamicTools, ...tools },
        stopWhen: stepCountIs(32),
    });

    phClient.shutdown();

    return {
        final: result.text,
        toolCalls: result.toolCalls,
    };
}

export async function runOrchestratorAgentJob(payload: AgentJobPayload) {
    const agent = await getAgentById(payload.agentId);
    if (!agent) throw new Error('agent not found');

    const repositoryFullName = payload.repositoryFullName || agent.workspace.githubRepositoryName;
    const baseBranch = payload.baseBranch || agent.workspace.currentBranch;
    if (!repositoryFullName) {
        await emitError(agent.id, 'missing_repository', 'No repository specified', 'init');
        return;
    }

    const token = await getGithubTokenForUser(agent.workspace.userId);
    if (!token) {
        await emitError(agent.id, 'github_token_missing', 'GitHub token missing', 'init');
        return;
    }

    await emitStatus(agent.id, 'starting', 'init', 'preparing sandbox');

    let sandbox: Sandbox;

    try {
        sandbox = await createSandbox(agent, token, repositoryFullName, baseBranch);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to create sandbox';
        await emitError(agent.id, 'sandbox_creation_failed', message, 'init');
        return;
    }

    try {
        await Promise.all([
            emitStatus(agent.id, 'running', 'orchestrator_agent_start', 'running orchestrator agent'),
            updateAgent(agent, { status: AgentStatus.RUNNING }),
        ]);

        const response = await runOrchestratorAgentLLM(agent, sandbox, payload.toolSlugs || [], payload.prompt);

        const savedMessage = await saveMessage(agent, response.final, 'AGENT');

        await persistToolCallsFromRedis(agent.id, savedMessage);

        await sandbox.stop();

        await Promise.all([updateAgent(agent, { status: AgentStatus.COMPLETED }), emitDone(agent.id, 'success')]);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'unknown error';
        await emitError(agent.id, 'agent_failure', message, 'execute');
        await updateAgent(agent, { status: AgentStatus.FAILED });
        throw err;
    }
}

export async function runAgentJob(payload: AgentJobPayload) {
    const agent = await getAgentById(payload.agentId);
    if (!agent) throw new Error('agent not found');

    const repositoryFullName = payload.repositoryFullName || agent.workspace.githubRepositoryName;
    const baseBranch = payload.baseBranch || agent.workspace.currentBranch;
    if (!repositoryFullName) {
        await emitError(agent.id, 'missing_repository', 'No repository specified', 'init');
        return;
    }

    const token = await getGithubTokenForUser(agent.workspace.userId);
    if (!token) {
        await emitError(agent.id, 'github_token_missing', 'GitHub token missing', 'init');
        return;
    }

    await emitStatus(agent.id, 'starting', 'init', 'preparing sandbox');

    let sandbox: Sandbox;

    try {
        sandbox = await createSandbox(agent, token, repositoryFullName, baseBranch);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to create sandbox';
        await emitError(agent.id, 'sandbox_creation_failed', message, 'init');
        return;
    }

    try {
        const previousMessagesPromise = AppDataSource.getRepository(Message).find({
            where: { agent: { id: agent.id } },
            order: { createdAt: 'ASC' },
        });

        if (!agent.githubBranchName && !payload.isOrchestratorAgent) {
            const branchName = generateBranchName(agent.id);
            await emitStatus(agent.id, 'running', 'create_branch', `creating branch ${branchName}`);
            await sandbox.runCommand({
                cmd: 'git',
                args: ['checkout', '-b', branchName],
            });
            await sandbox.runCommand({
                cmd: 'git',
                args: ['push', '-u', 'origin', branchName],
            });
            await updateAgent(agent, { githubBranchName: branchName });
        }

        const previousMessages = await previousMessagesPromise;

        await Promise.all([emitStatus(agent.id, 'running', 'agent_start', 'running AI'), updateAgent(agent, { status: AgentStatus.RUNNING })]);

        const response = await runAgentLLM(agent.id, sandbox, payload.toolSlugs || [], previousMessages);

        const savedMessage = await saveMessage(agent, response.final, 'AGENT');

        await persistToolCallsFromRedis(agent.id, savedMessage);

        if (payload.isOrchestratorAgent) {
            await sandbox.stop();

            await Promise.all([updateAgent(agent, { status: AgentStatus.COMPLETED }), emitDone(agent.id, 'success')]);
            return;
        }

        const statusResult = await sandbox.runCommand({
            cmd: 'git',
            args: ['status', '--porcelain'],
        });
        const hasChanges = (await statusResult.stdout()).trim().length > 0;
        if (hasChanges) {
            await emitStatus(agent.id, 'running', 'commit', 'committing changes');
            const commitMessage = `Codee: ${payload.prompt.slice(0, 50)}${payload.prompt.length > 50 ? '...' : ''}`;
            await commitAndPush(sandbox, commitMessage);
        }
        await sandbox.stop();

        await Promise.all([updateAgent(agent, { status: AgentStatus.COMPLETED }), emitDone(agent.id, 'success')]);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'unknown error';
        await emitError(agent.id, 'agent_failure', message, 'execute');
        await updateAgent(agent, { status: AgentStatus.FAILED });
        throw err;
    }
}
