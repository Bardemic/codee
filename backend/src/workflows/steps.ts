'use step';

import { Sandbox } from '@vercel/sandbox';
import { Agent, AgentStatus } from '../db/entities/Agent';
import { Message } from '../db/entities/Message';
import { AppDataSource } from '../db/data-source';
import { emitDone, emitError, emitStatus } from '../stream/events';
import { getAgentById, saveMessage, saveAgentActivity, updateAgent } from './helpers/agents';
import { commitAndPush, generateBranchName, getGithubTokenForUser } from './helpers/github';
import { createSandbox } from './helpers/sandbox';
import type { runAgentLLM, runOrchestratorAgentLLM, TokenUsageAccumulator } from './llm';
import { calculateCostMicrodollars } from '../payment/model-pricing';
import { incrementTokenCostMicrodollars } from '../payment/usage';

export async function loadAgent(agentId: number) {
    const agent = await getAgentById(agentId);
    if (!agent) throw new Error('agent not found');
    return agent;
}

export async function validateAndGetToken(agent: Agent, repositoryFullName: string | undefined) {
    const repoName = repositoryFullName || agent.workspace.githubRepositoryName;
    if (!repoName) {
        await emitError(agent.id, 'missing_repository', 'No repository specified', 'agent_init');
        throw new Error('No repository specified');
    }

    const token = await getGithubTokenForUser(agent.workspace.organizationId);
    if (!token) {
        await emitError(agent.id, 'github_token_missing', 'GitHub token missing', 'agent_init');
        throw new Error('GitHub token missing');
    }

    return { repositoryFullName: repoName, token };
}

export async function prepareSandbox(agent: Agent, token: string, repositoryFullName: string, baseBranch: string) {
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

export async function loadPreviousMessages(agentId: number) {
    return await AppDataSource.getRepository(Message).find({
        where: { agent: { id: agentId } },
        order: { createdAt: 'ASC' },
    });
}

export async function createBranchIfNeeded(agent: Agent, sandbox: Sandbox, isOrchestratorAgent: boolean) {
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

    await sandbox.runCommand({
        cmd: 'git',
        args: ['fetch', 'origin', `${agent.githubBranchName}:refs/remotes/origin/${agent.githubBranchName}`],
    });

    await emitStatus(agent.id, 'running', 'agent_checkout_branch', `checking out branch ${agent.githubBranchName}`);
    await sandbox.runCommand({
        cmd: 'git',
        args: ['checkout', '-b', agent.githubBranchName, 'FETCH_HEAD'],
    });
    return agent.githubBranchName;
}

export async function saveAgentResponse(
    agent: Agent,
    response: Awaited<ReturnType<typeof runAgentLLM>> | Awaited<ReturnType<typeof runOrchestratorAgentLLM>>,
    usage: TokenUsageAccumulator
) {
    const costMicrodollars = calculateCostMicrodollars(response.model, usage.promptTokens, usage.completionTokens);
    const savedMessage = await saveMessage(agent, response.final, 'AGENT', usage, costMicrodollars, response.model);

    // Update organization cost usage
    await incrementTokenCostMicrodollars(agent.workspace.organizationId, costMicrodollars);

    await saveAgentActivity(agent, savedMessage, response.steps);
    return savedMessage;
}

export async function commitChangesIfNeeded(sandbox: Sandbox, agentId: number, prompt: string) {
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

export async function cleanupSandbox(sandbox: Sandbox) {
    await sandbox.stop();
}

export async function markAgentComplete(agentId: number) {
    const agent = await getAgentById(agentId);
    if (!agent) throw new Error('agent not found');
    await Promise.all([updateAgent(agent, { status: AgentStatus.COMPLETED }), emitDone(agentId, 'success')]);
}

export async function markAgentFailed(agentId: number, error: unknown, usage: TokenUsageAccumulator, model: string) {
    const agent = await getAgentById(agentId);
    if (!agent) return;
    const message = error instanceof Error ? error.message : 'unknown error';
    await emitError(agentId, 'agent_failure', message, 'execute');
    await updateAgent(agent, { status: AgentStatus.FAILED });
    const costMicrodollars = calculateCostMicrodollars(model, usage.promptTokens, usage.completionTokens);
    await saveMessage(agent, `Agent failed: ${message}`, 'AGENT', usage, costMicrodollars, model, message);
    // store cost of message, but don't increment organization cost usage
}
