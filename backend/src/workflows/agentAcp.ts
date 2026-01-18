/**
 * ACP-based Agent Workflow
 * Uses Agent Client Protocol with Claude Code instead of direct AI SDK
 */

'use workflow';

import { Sandbox } from '@vercel/sandbox';
import { AgentStatus } from '../db/entities/Agent';
import { SubscriptionTier } from '../db/entities/Organization';
import { emitStatus } from '../stream/events';
import { type TokenUsageAccumulator } from './llm';
import {
    loadAgent,
    validateAndGetToken,
    prepareSandbox,
    loadPreviousMessages,
    createBranchIfNeeded,
    cleanupSandbox,
    markAgentComplete,
    markAgentFailed,
} from './steps';
import { updateAgent } from './helpers/agents';
import { AcpClient } from '../acp/client';
import { AppDataSource } from '../db/data-source';
import { Message } from '../db/entities/Message';
import type { AcpSessionConfig } from '../acp/types';

export type AgentJobPayload = {
    agentId: number;
    prompt: string;
    repositoryFullName?: string;
    toolSlugs?: string[];
    baseBranch: string;
    isOrchestratorAgent: boolean;
};

/**
 * Run agent workflow using ACP (Agent Client Protocol) with Claude Code
 */
export async function runAgentWorkflowAcp(payload: AgentJobPayload) {
    'use workflow';

    let sandbox: Sandbox | undefined;
    let acpClient: AcpClient | undefined;
    const usageAccumulator: TokenUsageAccumulator = {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
    };
    let sandboxStartTime = 0;

    try {
        // Load agent and workspace
        const agent = await loadAgent(payload.agentId);
        const { repositoryFullName, token } = await validateAndGetToken(
            agent,
            payload.repositoryFullName
        );

        // Prepare sandbox
        sandbox = await prepareSandbox(agent, token, repositoryFullName, payload.baseBranch);
        if (!sandbox) throw new Error('Failed to create sandbox');

        sandboxStartTime = Date.now();

        // Create branch if needed (for non-orchestrator agents)
        if (!payload.isOrchestratorAgent) {
            await createBranchIfNeeded(agent, sandbox, payload.isOrchestratorAgent);
        }

        // Load previous messages
        const previousMessages = await loadPreviousMessages(payload.agentId);

        // Update agent status
        await Promise.all([
            emitStatus(agent.id, 'running', 'acp_agent_starting', 'Starting Claude Code agent'),
            updateAgent(agent, { status: AgentStatus.RUNNING }),
        ]);

        // Initialize ACP client
        acpClient = new AcpClient(agent.id);

        // Get workspace and organization
        const workspace = agent.workspace;
        const organization = workspace.organization;

        // Create ACP session configuration
        const sessionConfig: AcpSessionConfig = {
            sandbox,
            workspace,
            organization,
            agent,
            enabledToolSlugs: payload.toolSlugs || [],
        };

        // Initialize ACP session
        await emitStatus(agent.id, 'running', 'acp_initializing', 'Initializing ACP session');
        const sessionId = await acpClient.initialize(sessionConfig);

        console.log('[ACP Workflow] Session created:', sessionId);

        // Send initial message
        await emitStatus(agent.id, 'running', 'acp_sending_message', 'Sending message to agent');

        const userMessage = previousMessages[previousMessages.length - 1];
        if (userMessage) {
            // Extract images if any
            const images = userMessage.images?.map((img: any) => img.data) || [];

            // Send message to ACP agent
            await acpClient.sendMessage(userMessage.content, images);
        }

        // Wait for agent to complete
        // In a full implementation, this would listen for the completion notification
        // For now, we'll use a simple timeout
        await new Promise((resolve) => setTimeout(resolve, 5000));

        await emitStatus(agent.id, 'running', 'acp_agent_complete', 'Agent completed');

        // Calculate sandbox duration
        const sandboxDurationMs = Date.now() - sandboxStartTime;

        // Save agent response
        // Note: In ACP mode, responses are saved via notification handlers
        // This is a placeholder for now
        await saveAgentResponseAcp(agent.id, usageAccumulator, sandboxDurationMs);

        // Commit changes if needed (for non-orchestrator agents)
        if (!payload.isOrchestratorAgent) {
            await commitChangesIfNeededAcp(agent, sandbox);
        }

        // Cleanup
        await acpClient.cleanup();
        await cleanupSandbox(sandbox, agent.id);

        // Mark as complete
        await markAgentComplete(agent.id);
    } catch (error: unknown) {
        console.error('[ACP Workflow] Error:', error);

        // Cleanup on error
        if (acpClient) {
            try {
                await acpClient.cleanup();
            } catch {
                // Ignore cleanup errors
            }
        }

        if (sandbox) {
            try {
                await cleanupSandbox(sandbox, payload.agentId);
            } catch {
                // Ignore cleanup errors
            }
        }

        await markAgentFailed(payload.agentId, error, usageAccumulator, 'claude-sonnet-4.5');
        throw error;
    }
}

/**
 * Save agent response for ACP mode
 * In ACP mode, messages are saved via notification handlers
 * This function updates metadata and usage
 */
async function saveAgentResponseAcp(
    agentId: number,
    usageAccumulator: TokenUsageAccumulator,
    sandboxDurationMs: number
): Promise<void> {
    // In a full implementation, we would:
    // 1. Get the latest agent message (created by notification handler)
    // 2. Update it with usage information
    // 3. Track costs

    console.log('[ACP Workflow] Saving response metadata', {
        agentId,
        usage: usageAccumulator,
        sandboxDurationMs,
    });

    // For now, this is a placeholder
}

/**
 * Commit changes if needed (ACP version)
 */
async function commitChangesIfNeededAcp(agent: any, sandbox: Sandbox): Promise<void> {
    try {
        // Check if there are changes to commit
        const statusResult = await sandbox.runCommand({
            cmd: 'bash',
            args: ['-c', 'git status --porcelain'],
        });

        const statusOutput = await statusResult.stdout();

        if (statusOutput.trim()) {
            await emitStatus(agent.id, 'running', 'committing_changes', 'Committing changes');

            // Get commit message from agent
            // For now, use a default message
            const commitMessage = `Changes made by agent ${agent.id}`;

            // Add all changes
            await sandbox.runCommand({
                cmd: 'bash',
                args: ['-c', 'git add -A'],
            });

            // Commit
            await sandbox.runCommand({
                cmd: 'bash',
                args: ['-c', `git commit -m "${commitMessage}"`],
            });

            // Push to remote
            const branchName = `claude/${agent.branchName}`;
            await sandbox.runCommand({
                cmd: 'bash',
                args: ['-c', `git push -u origin ${branchName}`],
            });

            await emitStatus(agent.id, 'running', 'changes_committed', 'Changes committed and pushed');
        } else {
            console.log('[ACP Workflow] No changes to commit');
        }
    } catch (error) {
        console.error('[ACP Workflow] Error committing changes:', error);
        // Don't throw - committing is not critical
    }
}
