import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { Sandbox } from '@vercel/sandbox';
import { AgentStatus } from '../db/entities/Agent';
import { sandboxTools } from '../tools/sandboxTools';
import { emitDone, emitError, emitStatus } from '../stream/events';
import type { AgentJobPayload } from './queue';
import { buildDynamicTools } from '../tools/dynamic';
import { getAgentById, getAgentMessages, saveMessage, updateAgent, persistToolCallsFromRedis, type AgentMessage } from './helpers/agents';
import { commitAndPush, generateBranchName, getGithubTokenForUser } from './helpers/github';
import { createSandbox } from './helpers/sandbox';

const AGENT_SYSTEM_PROMPT = `
You are Codee, an asynchronous coding agent. You work on GitHub repositories, read code, make changes, and explain your steps succinctly.
If the user requests git operations, prefer using tools (update_file, list_files, read_file, grep).
Avoid destructive operations. Return concise reasoning and resulting changes.
`;

async function runAgentLLM(agentId: number, prompt: string, sandbox: Sandbox, toolSlugs: string[], previousMessages?: AgentMessage[]) {
    const tools = sandboxTools(agentId, sandbox);
    const dynamicTools = await buildDynamicTools(agentId, toolSlugs, sandbox);
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
        model: openai('gpt-5-nano'),
        providerOptions: {
            openai: {
                //temp, for testing
                reasoningEffort: 'minimal',
            },
        },
        system: AGENT_SYSTEM_PROMPT,
        messages,
        tools: { ...tools, ...dynamicTools },
        maxSteps: 32,
    });

    return {
        final: result.text,
        toolCalls: result.toolCalls,
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

    try {
        sandbox = await createSandbox(agent, token, repositoryFullName);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to create sandbox';
        await emitError(agent.id, 'sandbox_creation_failed', message, 'init');
        return;
    }

    try {
        const previousMessagesPromise = getAgentMessages(agent.id);

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
        }

        const previousMessages = await previousMessagesPromise;

        await Promise.all([emitStatus(agent.id, 'running', 'agent_start', 'running AI'), updateAgent(agent, { status: AgentStatus.RUNNING })]);

        const response = await runAgentLLM(
            agent.id,
            payload.prompt,
            sandbox,
            payload.toolSlugs || [],
            previousMessages.slice(0, -1) // Exclude the current message we just added
        );

        const savedMessage = await saveMessage(agent, response.final, 'AGENT');

        await persistToolCallsFromRedis(agent.id, savedMessage);

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
