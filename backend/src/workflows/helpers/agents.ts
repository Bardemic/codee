import { TRPCError } from '@trpc/server';
import { AppDataSource } from '../../db/data-source';
import { Agent } from '../../db/entities/Agent';
import { IntegrationConnection } from '../../db/entities/IntegrationConnection';
import { Message, type SenderType } from '../../db/entities/Message';
import { ToolCall, type ToolCallImage } from '../../db/entities/ToolCall';
import { updateSlackWorkspaceStatus } from '../../slack/notifications';
import type { TokenUsageAccumulator } from '../llm';
import type { BrowserToolResult } from '../../tools/kernel/index';

export async function getAgentById(agentId: number) {
    return AppDataSource.getRepository(Agent).findOne({
        where: { id: agentId },
        relations: ['workspace'],
    });
}

export async function saveMessage(
    agent: Agent,
    content: string,
    sender: SenderType,
    usage: TokenUsageAccumulator,
    costMicrodollars: number,
    model: string,
    sandboxDurationMs: number,
    error?: string
) {
    const messageRepository = AppDataSource.getRepository(Message);
    const message = messageRepository.create({
        agent,
        content,
        sender,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        error,
        model,
        costMicrodollars,
        sandboxDurationMs,
    });
    return messageRepository.save(message);
}

export async function saveAgentActivity(
    agent: Agent,
    message: Message,
    steps: Array<{ reasoning: ReadonlyArray<{ text?: string | null }>; toolResults: ReadonlyArray<{ toolName: string; input?: unknown; output?: unknown }> }>
) {
    const toolCallRepository = AppDataSource.getRepository(ToolCall);
    const savedToolCalls: ToolCall[] = [];

    for (const step of steps) {
        for (const reasoning of step.reasoning) {
            const reasoningText = typeof reasoning.text === 'string' ? reasoning.text : '';
            if (reasoningText.trim() === '' || reasoningText.length === 0) continue;
            savedToolCalls.push(
                toolCallRepository.create({
                    agent,
                    message,
                    toolName: 'reasoning',
                    arguments: {},
                    result: reasoningText,
                    images: [],
                    status: 'success',
                })
            );
        }
        for (const toolResult of step.toolResults) {
            const toolArguments = (toolResult.input ?? {}) as Record<string, unknown>;

            // Extract images if present in output (for browser tools)
            const output = toolResult.output as BrowserToolResult | string | undefined;
            let resultText: string;
            let images: ToolCallImage[] = [];

            if (typeof output === 'object' && output !== null && 'text' in output) {
                resultText = output.text || '';
                images = output.images || [];
            } else {
                resultText = (output as string) || '';
            }

            savedToolCalls.push(
                toolCallRepository.create({
                    agent,
                    message,
                    toolName: toolResult.toolName,
                    arguments: toolArguments,
                    result: resultText,
                    images,
                    status: 'success',
                })
            );
        }
    }

    if (savedToolCalls.length === 0) return;

    await toolCallRepository.save(savedToolCalls);
}

export async function updateAgent(agent: Agent, updates: Partial<Agent>) {
    const statusChanged = updates.status && updates.status !== agent.status;

    Object.assign(agent, updates);
    const savedAgent = await AppDataSource.getRepository(Agent).save(agent);

    if (statusChanged) {
        setImmediate(() => {
            updateSlackWorkspaceStatus(agent.id).catch((error) => {
                console.error('Failed to update Slack agent status:', error);
            });
        });
    }

    return savedAgent;
}

export async function getIntegrationApiKey(organizationId: number, providerSlug: string): Promise<string> {
    const connectionRepository = AppDataSource.getRepository(IntegrationConnection);
    const connection = await connectionRepository.findOne({
        where: { organizationId, provider: { slug: providerSlug } },
        relations: ['provider'],
    });

    if (!connection) {
        throw new TRPCError({
            code: 'NOT_FOUND',
            message: `${providerSlug} not connected`,
        });
    }

    const apiKey = connection.getDataConfig()?.api_key;
    if (!apiKey) {
        throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `${providerSlug} API key not found`,
        });
    }

    return apiKey;
}
