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
import { CodeeProvider } from '../../providers/codee';
import { generateBranchName } from '../../workflows/helpers/github';
import { checkMessageQuota, trackMessageUsage } from '../../services/billingService';

const providerConfig = z.object({
    name: z.string(),
    agents: z.array(z.object({ model: z.string().nullable().optional() })),
});

const imageSchema = z.object({
    data: z.string(),
    mimeType: z.string(),
});

export const workspaceRouter = router({
    list: authedProcedure.query(async ({ ctx }) => {
        const workspaces = await AppDataSource.getRepository(Workspace).find({
            where: { organizationId: ctx.organization.id },
            relations: ['providerAgents'],
            order: { createdAt: 'DESC' },
        });

        return workspaces.map((workspace) => ({
            id: workspace.id,
            created_at: workspace.createdAt,
            name: workspace.name,
            current_branch: workspace.currentBranch,
            github_repository_name: workspace.githubRepositoryName,
            agents:
                workspace.providerAgents?.map((agent) => ({
                    id: agent.id,
                    name: agent.name,
                    status: agent.status,
                    integration: agent.providerType,
                    url: agent.url,
                    github_branch_name: agent.githubBranchName,
                    is_orchestrator_agent: agent.isOrchestratorAgent,
                })) || [],
        }));
    }),

    get: authedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
        const workspace = await AppDataSource.getRepository(Workspace).findOne({
            where: { id: input.id, organizationId: ctx.organization.id },
            relations: ['providerAgents'],
        });
        if (!workspace) throw new TRPCError({ code: 'NOT_FOUND' });
        return {
            id: workspace.id,
            created_at: workspace.createdAt,
            name: workspace.name,
            current_branch: workspace.currentBranch,
            github_repository_name: workspace.githubRepositoryName,
            agents: workspace.providerAgents,
        };
    }),

    create: authedProcedure
        .input(
            z.object({
                message: z.string(),
                repository_full_name: z.string(),
                tool_slugs: z.array(z.string()),
                cloud_providers: z.array(providerConfig).min(1),
                branch_name: z.string().min(1),
                sub_agents: z.boolean(),
                images: z.array(imageSchema).default([]),
            })
        )
        .mutation(async ({ ctx, input }) => {
            // Check message quota before creating workspace with initial message
            const quota = await checkMessageQuota(ctx.organization.id);
            if (!quota.allowed) {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: `Message limit reached. You have used ${quota.limit} of ${quota.limit} messages this month. Please upgrade to send more messages.`,
                });
            }

            const title = await generateTitle(input.message);
            const workspaceRepository = AppDataSource.getRepository(Workspace);
            const toolRepository = AppDataSource.getRepository(Tool);
            const newWorkspace = workspaceRepository.create({
                name: title,
                organizationId: ctx.organization.id,
                githubRepositoryName: input.repository_full_name,
                currentBranch: input.branch_name,
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

            let agentId: number;

            if (!input.sub_agents) {
                const firstAgent = await createAgentsFromProviders({
                    organizationId: ctx.organization.id,
                    workspace: newWorkspace,
                    repositoryFullName: input.repository_full_name,
                    message: input.message,
                    toolSlugs: input.tool_slugs,
                    branchName: input.branch_name,
                    cloudProviders: input.cloud_providers,
                    images: input.images,
                });
                agentId = firstAgent.id;
            } else {
                const orchestratorAgent = await new CodeeProvider().createAgent({
                    organizationId: ctx.organization.id,
                    workspace: newWorkspace,
                    repositoryFullName: input.repository_full_name,
                    message: input.message,
                    toolSlugs: input.tool_slugs,
                    baseBranch: input.branch_name,
                    isOrchestratorAgent: true,
                    images: input.images,
                });
                agentId = orchestratorAgent.id;
            }

            // Track message usage for the initial message
            await trackMessageUsage(ctx.organization.id);

            return { agent_id: agentId };
        }),

    messages: authedProcedure.input(z.object({ agent_id: z.number() })).query(async ({ ctx, input }) => {
        const agent = await AppDataSource.getRepository(Agent).findOne({
            where: { id: input.agent_id },
            relations: ['workspace'],
        });
        if (!agent || agent.workspace.organizationId !== ctx.organization.id) {
            throw new TRPCError({ code: 'NOT_FOUND' });
        }
        const ProviderClass = PROVIDERS[agent.providerType];
        if (!ProviderClass) return [];
        const provider = new ProviderClass();
        return provider.getMessages(agent);
    }),

    sendMessage: authedProcedure
        .input(z.object({ agent_id: z.number(), message: z.string(), images: z.array(imageSchema).default([]) }))
        .mutation(async ({ ctx, input }) => {
            // Check message quota before sending
            const quota = await checkMessageQuota(ctx.organization.id);
            if (!quota.allowed) {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: `Message limit reached. You have used ${quota.limit} of ${quota.limit} messages this month. Please upgrade to send more messages.`,
                });
            }

            const agent = await AppDataSource.getRepository(Agent).findOne({
                where: { id: input.agent_id },
                relations: ['workspace'],
            });
            if (!agent || agent.workspace.organizationId !== ctx.organization.id) {
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
            const success = await provider.sendMessage(agent, input.message, input.images);

            // Track message usage after successful send
            if (success) {
                await trackMessageUsage(ctx.organization.id);
            }

            return { ok: success };
        }),

    agentStatus: authedProcedure.input(z.object({ agent_id: z.number() })).query(async ({ ctx, input }) => {
        const agent = await AppDataSource.getRepository(Agent).findOne({
            where: { id: input.agent_id },
            relations: ['workspace'],
        });
        if (!agent || agent.workspace.organizationId !== ctx.organization.id) {
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
        if (!agent || agent.workspace.organizationId !== ctx.organization.id) {
            throw new TRPCError({ code: 'NOT_FOUND' });
        }
        const branchName = agent.githubBranchName || generateBranchName({ title: agent.workspace.name, agentId: agent.id });
        agent.githubBranchName = branchName;
        await agentRepository.save(agent);
        return { branch_name: branchName };
    }),
});
