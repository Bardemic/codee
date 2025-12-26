import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { authedProcedure, router } from '../trpc';
import { AppDataSource } from '../../db/data-source';
import { Workspace } from '../../db/entities/Workspace';
import { Agent } from '../../db/entities/Agent';
import { Message } from '../../db/entities/Message';
import { Tool } from '../../db/entities/Tool';
import { WorkspaceTool } from '../../db/entities/WorkspaceTool';
import { createAgentsFromProviders } from '../../providers';
import { generateTitle } from '../../utils/llm';
import { ProviderType } from '../../db/entities/Agent';
import { emitStatus } from '../../stream/events';
import { In } from 'typeorm';
import { ToolCall } from '../../db/entities/ToolCall';

const providerConfig = z.object({
    name: z.string(),
    agents: z.array(z.object({ model: z.string().nullable().optional() })),
});

export const workspaceRouter = router({
    list: authedProcedure.query(async ({ ctx }) => {
        const workspaceRepository = AppDataSource.getRepository(Workspace);
        const workspaces = await workspaceRepository.find({
            where: { userId: ctx.user.id },
            order: { createdAt: 'DESC' },
        });

        const workspaceIds = workspaces.map((workspace) => workspace.id);
        const agentRepository = AppDataSource.getRepository(Agent);
        const agents = await agentRepository.find({ where: { workspace: { id: In(workspaceIds) } }, relations: ['workspace'] });
        const agentsByWorkspace = new Map<number, Agent[]>();
        for (const agent of agents) {
            const workspaceId = agent.workspace?.id;
            if (!workspaceId) continue;
            const list = agentsByWorkspace.get(workspaceId) || [];
            list.push(agent);
            agentsByWorkspace.set(workspaceId, list);
        }
        return workspaces.map((workspace) => ({
            id: workspace.id,
            created_at: workspace.createdAt,
            name: workspace.name,
            default_branch: workspace.defaultBranch,
            github_repository_name: workspace.githubRepositoryName,
            agents: (agentsByWorkspace.get(workspace.id) || []).map((agent) => ({
                id: agent.id,
                name: agent.name,
                status: agent.status,
                integration: agent.providerType,
                url: agent.url,
                github_branch_name: agent.githubBranchName,
            })),
        }));
    }),

    get: authedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
        const workspace = await AppDataSource.getRepository(Workspace).findOne({
            where: { id: input.id, userId: ctx.user.id },
        });
        if (!workspace) throw new TRPCError({ code: 'NOT_FOUND' });
        const agents = await AppDataSource.getRepository(Agent).find({
            where: { workspace: { id: workspace.id } },
        });
        return {
            id: workspace.id,
            created_at: workspace.createdAt,
            name: workspace.name,
            default_branch: workspace.defaultBranch,
            github_repository_name: workspace.githubRepositoryName,
            agents,
        };
    }),

    create: authedProcedure
        .input(
            z.object({
                message: z.string(),
                repository_full_name: z.string(),
                tool_slugs: z.array(z.string()),
                cloud_providers: z.array(providerConfig).min(1),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const title = await generateTitle(input.message);
            const workspaceRepository = AppDataSource.getRepository(Workspace);
            const toolRepository = AppDataSource.getRepository(Tool);
            const newWorkspace = workspaceRepository.create({
                name: title,
                userId: ctx.user.id,
                githubRepositoryName: input.repository_full_name,
            });
            await workspaceRepository.save(newWorkspace);

            const tools = await toolRepository.findBy({
                slugName: In(input.tool_slugs),
            });

            // Validate that all requested tools exist
            if (tools.length !== input.tool_slugs.length) {
                const validSlugs = new Set(tools.map((tool) => tool.slugName));
                const invalidSlugs = input.tool_slugs.filter((slug) => !validSlugs.has(slug));
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: `Invalid tool slugs provided: ${invalidSlugs.join(', ')}`,
                });
            }

            const workspaceToolRepository = AppDataSource.getRepository(WorkspaceTool);
            await Promise.all(
                tools.map((tool) =>
                    workspaceToolRepository.save(
                        workspaceToolRepository.create({
                            workspace: newWorkspace,
                            tool,
                        })
                    )
                )
            );

            const firstAgent = await createAgentsFromProviders({
                userId: ctx.user.id,
                workspace: newWorkspace,
                repositoryFullName: input.repository_full_name,
                message: input.message,
                toolSlugs: input.tool_slugs,
                cloudProviders: input.cloud_providers,
            });

            return { agent_id: firstAgent.id };
        }),

    messages: authedProcedure.input(z.object({ agent_id: z.number() })).query(async ({ ctx, input }) => {
        const agent = await AppDataSource.getRepository(Agent).findOne({
            where: { id: input.agent_id },
            relations: ['workspace'],
        });
        if (!agent || agent.workspace.userId !== ctx.user.id) {
            throw new TRPCError({ code: 'NOT_FOUND' });
        }
        const messages = await AppDataSource.getRepository(Message).find({
            where: { agent: { id: agent.id } },
            order: { createdAt: 'ASC' },
        });
        const messageIds = messages.map((message) => message.id);
        const toolCalls = messageIds.length
            ? await AppDataSource.getRepository(ToolCall).find({
                  where: { message: { id: In(messageIds) } },
                  order: { createdAt: 'ASC' },
              })
            : [];
        type TransformedToolCall = {
            id: number;
            created_at: Date;
            tool_name: string;
            arguments: Record<string, unknown>;
            result: string;
            status: string;
            duration_ms: number | null;
        };
        const toolCallsByMessage = new Map<number, TransformedToolCall[]>();
        for (const toolCall of toolCalls) {
            const list = toolCallsByMessage.get(toolCall.message.id) || [];
            list.push({
                id: toolCall.id,
                created_at: toolCall.createdAt,
                tool_name: toolCall.toolName,
                arguments: toolCall.arguments,
                result: toolCall.result,
                status: toolCall.status,
                duration_ms: toolCall.durationMs,
            });
            toolCallsByMessage.set(toolCall.message.id, list);
        }
        return messages.map((message) => ({
            id: message.id,
            created_at: message.createdAt,
            sender: message.sender,
            content: message.content,
            tool_calls: toolCallsByMessage.get(message.id) || [],
        }));
    }),

    sendMessage: authedProcedure.input(z.object({ agent_id: z.number(), message: z.string() })).mutation(async ({ ctx, input }) => {
        const agent = await AppDataSource.getRepository(Agent).findOne({
            where: { id: input.agent_id },
            relations: ['workspace'],
        });
        if (!agent || agent.workspace.userId !== ctx.user.id) {
            throw new TRPCError({ code: 'NOT_FOUND' });
        }
        if (agent.providerType !== ProviderType.CODEE) {
            throw new TRPCError({
                code: 'NOT_IMPLEMENTED',
                message: 'Send message supported only for Codee agents currently',
            });
        }
        // For Codee, reuse provider to enqueue job
        const toolSlugs = await AppDataSource.getRepository(WorkspaceTool).find({
            where: { workspace: { id: agent.workspace.id } },
            relations: ['tool'],
        });
        const messageRepository = AppDataSource.getRepository(Message);
        const userMessage = messageRepository.create({
            agent,
            content: input.message,
            sender: 'USER',
        });
        await messageRepository.save(userMessage);
        await emitStatus(agent.id, 'queued', 'message', 'queued follow up');
        await import('../../workers/queue').then(({ enqueueAgentJob }) =>
            enqueueAgentJob({
                prompt: input.message,
                agentId: agent.id,
                toolSlugs: toolSlugs.map((workspaceTool) => workspaceTool.tool.slugName),
            })
        );
        return { ok: true };
    }),

    agentStatus: authedProcedure.input(z.object({ agent_id: z.number() })).query(async ({ ctx, input }) => {
        const agent = await AppDataSource.getRepository(Agent).findOne({
            where: { id: input.agent_id },
            relations: ['workspace'],
        });
        if (!agent || agent.workspace.userId !== ctx.user.id) {
            throw new TRPCError({ code: 'NOT_FOUND' });
        }
        return { status: agent.status, provider_type: agent.providerType };
    }),

    createBranch: authedProcedure.input(z.object({ agent_id: z.number() })).mutation(async ({ ctx, input }) => {
        const agentRepository = AppDataSource.getRepository(Agent);
        const agent = await agentRepository.findOne({
            where: { id: input.agent_id },
            relations: ['workspace'],
        });
        if (!agent || agent.workspace.userId !== ctx.user.id) {
            throw new TRPCError({ code: 'NOT_FOUND' });
        }
        const branchName = agent.githubBranchName || `codee/agent-${agent.id}-${Date.now().toString(16)}`;
        agent.githubBranchName = branchName;
        await agentRepository.save(agent);
        return { branch_name: branchName };
    }),
});
