import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { authedProcedure, router } from '../trpc';
import { AppDataSource } from '../../db/data-source';
import { Workspace } from '../../db/entities/Workspace';
import { Agent } from '../../db/entities/Agent';
import { Tool } from '../../db/entities/Tool';
import { WorkspaceTool } from '../../db/entities/WorkspaceTool';
import { createAgentsFromProviders, PROVIDERS } from '../../providers';
import { generateTitle } from '../../utils/llm';
import { In } from 'typeorm';

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
            const workspaceTools = tools.map((tool) =>
                workspaceToolRepository.create({
                    workspace: newWorkspace,
                    tool,
                })
            );
            if (workspaceTools.length > 0) {
                await workspaceToolRepository.save(workspaceTools);
            }

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
        const ProviderClass = PROVIDERS[agent.providerType];
        if (!ProviderClass) return [];
        const provider = new ProviderClass();
        return provider.getMessages(agent);
    }),

    sendMessage: authedProcedure.input(z.object({ agent_id: z.number(), message: z.string() })).mutation(async ({ ctx, input }) => {
        const agent = await AppDataSource.getRepository(Agent).findOne({
            where: { id: input.agent_id },
            relations: ['workspace'],
        });
        if (!agent || agent.workspace.userId !== ctx.user.id) {
            throw new TRPCError({ code: 'NOT_FOUND' });
        }
        const ProviderClass = PROVIDERS[agent.providerType];
        if (!ProviderClass) {
            throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'Provider not found',
            });
        }
        const provider = new ProviderClass();
        const success = await provider.sendMessage(agent, input.message);
        return { ok: success };
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
