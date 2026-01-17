'use workflow';

import { Sandbox } from '@vercel/sandbox';
import { AgentStatus } from '../db/entities/Agent';
import { SubscriptionTier } from '../db/entities/Organization';
import { emitStatus } from '../stream/events';
import { runAgentLLM, runOrchestratorAgentLLM, type TokenUsageAccumulator, AGENT_MODEL, ORCHESTRATOR_MODEL } from './llm';
import {
    loadAgent,
    validateAndGetToken,
    prepareSandbox,
    loadPreviousMessages,
    createBranchIfNeeded,
    saveAgentResponse,
    commitChangesIfNeeded,
    cleanupSandbox,
    markAgentComplete,
    markAgentFailed,
} from './steps';
import { updateAgent } from './helpers/agents';

export type AgentJobPayload = {
    agentId: number;
    prompt: string;
    repositoryFullName?: string;
    toolSlugs?: string[];
    baseBranch: string;
    isOrchestratorAgent: boolean;
};

export async function runOrchestratorAgentWorkflow(payload: AgentJobPayload) {
    'use workflow';

    let sandbox: Sandbox | undefined;
    const usageAccumulator: TokenUsageAccumulator = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    let sandboxStartTime = 0;

    try {
        const agent = await loadAgent(payload.agentId);
        const { repositoryFullName, token } = await validateAndGetToken(agent, payload.repositoryFullName);

        sandbox = await prepareSandbox(agent, token, repositoryFullName, payload.baseBranch);
        if (!sandbox) throw new Error('Failed to create sandbox');

        sandboxStartTime = Date.now();

        const previousMessages = await loadPreviousMessages(payload.agentId);

        await Promise.all([
            emitStatus(agent.id, 'running', 'agent_orchestrator_start', 'running orchestrator agent'),
            updateAgent(agent, { status: AgentStatus.RUNNING }),
        ]);

        const response = await runOrchestratorAgentLLM(agent, sandbox, payload.toolSlugs || [], previousMessages, usageAccumulator);

        const sandboxDurationMs = Date.now() - sandboxStartTime;
        await saveAgentResponse(agent, response, usageAccumulator, sandboxDurationMs);

        await cleanupSandbox(sandbox, agent.id);

        await markAgentComplete(agent.id);
    } catch (error: unknown) {
        if (sandbox) {
            try {
                await cleanupSandbox(sandbox, payload.agentId);
            } catch {
                // Ignore cleanup errors
            }
        }
        await markAgentFailed(payload.agentId, error, usageAccumulator, ORCHESTRATOR_MODEL);
        throw error;
    }
}

export async function runAgentWorkflow(payload: AgentJobPayload) {
    'use workflow';

    let sandbox: Sandbox | undefined;
    const usageAccumulator: TokenUsageAccumulator = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    let sandboxStartTime = 0;

    try {
        const agent = await loadAgent(payload.agentId);
        const { repositoryFullName, token } = await validateAndGetToken(agent, payload.repositoryFullName);

        sandbox = await prepareSandbox(agent, token, repositoryFullName, payload.baseBranch);
        if (!sandbox) throw new Error('Failed to create sandbox');

        sandboxStartTime = Date.now();

        await createBranchIfNeeded(agent, sandbox, payload.isOrchestratorAgent);

        const previousMessages = await loadPreviousMessages(payload.agentId);

        await Promise.all([emitStatus(agent.id, 'running', 'sandboxagent_starting', 'running AI'), updateAgent(agent, { status: AgentStatus.RUNNING })]);

        const subscriptionTier = agent.workspace.organization?.subscriptionTier ?? SubscriptionTier.FREE;
        const response = await runAgentLLM(agent.id, sandbox, payload.toolSlugs || [], previousMessages, usageAccumulator, subscriptionTier);

        const sandboxDurationMs = Date.now() - sandboxStartTime;
        await saveAgentResponse(agent, response, usageAccumulator, sandboxDurationMs);

        if (payload.isOrchestratorAgent) {
            await cleanupSandbox(sandbox, agent.id);
            await markAgentComplete(agent.id);
            return;
        }

        await commitChangesIfNeeded(sandbox, agent.id, payload.prompt);

        await cleanupSandbox(sandbox, agent.id);

        await markAgentComplete(agent.id);
    } catch (error: unknown) {
        if (sandbox) {
            try {
                await cleanupSandbox(sandbox, payload.agentId);
            } catch {
                // Ignore cleanup errors
            }
        }
        await markAgentFailed(payload.agentId, error, usageAccumulator, AGENT_MODEL);
        throw error;
    }
}
