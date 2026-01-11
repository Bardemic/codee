'use workflow';

import { Sandbox } from '@vercel/sandbox';
import { AgentStatus } from '../db/entities/Agent';
import { updateAgent } from '../workers/helpers/agents';
import { emitStatus } from '../stream/events';
import { runAgentLLM, runOrchestratorAgentLLM } from './llm';
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

        await Promise.all([emitStatus(agent.id, 'running', 'sandboxagent_starting', 'running AI'), updateAgent(agent, { status: AgentStatus.RUNNING })]);

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
