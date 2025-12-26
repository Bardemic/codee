import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { withTracing } from '@posthog/ai';
import { Sandbox } from '@vercel/sandbox';
import { AgentStatus } from '../db/entities/Agent';
import { sandboxTools } from '../tools/sandboxTools';
import { emitDone, emitError, emitStatus } from '../stream/events';
import type { AgentJobPayload } from './queue';
import { buildDynamicTools } from '../tools/dynamic';
import { getPostHog } from '../utils/posthog';
import { getAgentById, getAgentMessages, saveMessage, updateAgent, type AgentMessage } from './helpers/agents';
import { commitAndPush, generateBranchName, getGithubTokenForUser } from './helpers/github';
import { getOrCreateSandbox } from './helpers/sandbox';

const openaiClient = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    compatibility: 'strict',
});

const AGENT_SYSTEM_PROMPT = `
You are Codee, an asynchronous coding agent. You work on GitHub repositories, read code, make changes, and explain your steps succinctly.
If the user requests git operations, prefer using tools (update_file, list_files, read_file, grep).
Avoid destructive operations. Return concise reasoning and resulting changes.
`;

async function runAgentLLM(agentId: number, prompt: string, sandbox: Sandbox, toolSlugs: string[], previousMessages?: AgentMessage[]) {
    const agent = await getAgentById(agentId);
    const tools = sandboxTools(agentId, sandbox);
    const dynamicTools = await buildDynamicTools(agentId, toolSlugs, sandbox);

    const postHogClient = getPostHog();
    const model = withTracing(openaiClient('gpt-5-nano'), postHogClient, {
        posthogDistinctId: String(agent?.workspace?.userId ?? agentId),
        posthogProperties: {
            agentId,
            workspaceId: agent?.workspace?.id,
            toolSlugs,
            previousMessagesCount: previousMessages?.length || 0,
        },
    });

    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
        ...(previousMessages || []).map<{
            role: 'user' | 'assistant';
            content: string;
        }>((message) => ({
            role: message.sender === 'USER' ? 'user' : 'assistant',
            content: message.content,
        })),
        { role: 'user', content: prompt },
    ];

    const result = await generateText({
        model,
        system: AGENT_SYSTEM_PROMPT,
        messages,
        tools: { ...tools, ...dynamicTools },
        maxSteps: 32,
    });

    return {
        final: result.text,
        toolCalls: result.toolCalls || [],
    };
}

export async function runAgentJob(payload: AgentJobPayload) {
    const agent = await getAgentById(payload.agentId);
    if (!agent) throw new Error('agent not found');

    const repositoryFullName = payload.repositoryFullName || agent.workspace.githubRepositoryName;
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
    let isNewSandbox: boolean;

    try {
        const result = await getOrCreateSandbox(agent, token, repositoryFullName);
        sandbox = result.sandbox;
        isNewSandbox = result.isNew;
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to create sandbox';
        await emitError(agent.id, 'sandbox_creation_failed', message, 'init');
        return;
    }

    try {
        if (!agent.githubBranchName) {
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
        } else if (isNewSandbox) {
            await emitStatus(agent.id, 'running', 'pull_branch', `pulling latest from ${agent.githubBranchName}`);
            await sandbox.runCommand({
                cmd: 'git',
                args: ['fetch', 'origin', agent.githubBranchName],
            });
            await sandbox.runCommand({
                cmd: 'git',
                args: ['checkout', agent.githubBranchName],
            });
            await sandbox.runCommand({
                cmd: 'git',
                args: ['pull', 'origin', agent.githubBranchName],
            });
        }

        const previousMessages = await getAgentMessages(agent.id);

        await emitStatus(agent.id, 'running', 'agent_start', 'running AI');
        await updateAgent(agent, { status: AgentStatus.RUNNING });

        const response = await runAgentLLM(
            agent.id,
            payload.prompt,
            sandbox,
            payload.toolSlugs || [],
            previousMessages.slice(0, -1) // Exclude the current message we just added
        );

        await saveMessage(agent, response.final, 'AGENT');

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

        await updateAgent(agent, { status: AgentStatus.COMPLETED });
        await emitDone(agent.id, 'success');
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'unknown error';
        await emitError(agent.id, 'agent_failure', message, 'execute');
        await updateAgent(agent, { status: AgentStatus.FAILED });
        throw err;
    }
}
