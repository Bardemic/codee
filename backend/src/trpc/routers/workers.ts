import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { authedProcedure, router } from '../trpc';
import { AppDataSource } from '../../db/data-source';
import { WorkerDefinition } from '../../db/entities/WorkerDefinition';
import { Tool } from '../../db/entities/Tool';
import { In } from 'typeorm';
import { WorkerDefinitionTool } from '../../db/entities/WorkerDefinitionTool';
import { Workspace } from '../../db/entities/Workspace';
import { Agent } from '../../db/entities/Agent';

const cloudProviderSchema = z.object({
    name: z.string(),
    agents: z.array(z.object({ model: z.string().nullable().optional() })),
});

const workerInput = z.object({
    slug: z.string().min(1),
    prompt: z.string().min(1),
    tool_slugs: z.array(z.string()),
    key: z.string().optional(),
    cloud_providers: z.array(cloudProviderSchema).min(0),
});

export const workersRouter = router({
    list: authedProcedure.query(async ({ ctx }) => {
        const workerRepository = AppDataSource.getRepository(WorkerDefinition);
        const workers = await workerRepository.find({
            where: { userId: ctx.user.id },
            order: { id: 'DESC' },
        });
        const workerIds = workers.map((worker) => worker.id);
        const workspaceRepository = AppDataSource.getRepository(Workspace);
        const workspaces = workerIds.length
            ? await workspaceRepository.find({
                  where: { workerId: In(workerIds) },
                  order: { createdAt: 'DESC' },
              })
            : [];
        const workspaceIds = workspaces.map((workspace) => workspace.id);
        const agentRepository = AppDataSource.getRepository(Agent);
        const agents = workspaceIds.length
            ? await agentRepository.find({
                  where: { workspace: { id: In(workspaceIds) } },
              })
            : [];
        const agentsByWorkspace = new Map<number, Agent[]>();
        for (const agent of agents) {
            const list = agentsByWorkspace.get(agent.workspace.id) || [];
            list.push(agent);
            agentsByWorkspace.set(agent.workspace.id, list);
        }
        const workspacesByWorker = new Map<number, Workspace[]>();
        for (const workspace of workspaces) {
            const list = workspacesByWorker.get(workspace.workerId || -1) || [];
            list.push(workspace);
            workspacesByWorker.set(workspace.workerId || -1, list.slice(0, 3));
        }
        const linkRepository = AppDataSource.getRepository(WorkerDefinitionTool);
        const links = workerIds.length
            ? await linkRepository.find({
                  where: { workerDefinition: { id: In(workerIds) } },
                  relations: ['tool', 'workerDefinition'],
              })
            : [];
        const toolsByWorker = new Map<number, Tool[]>();
        for (const link of links) {
            const list = toolsByWorker.get(link.workerDefinition.id) || [];
            if (link.tool) list.push(link.tool);
            toolsByWorker.set(link.workerDefinition.id, list);
        }
        return workers.map((worker) => ({
            id: worker.id,
            slug: worker.slug,
            prompt: worker.prompt,
            tools: (toolsByWorker.get(worker.id) || []).map((tool) => ({
                id: tool.id,
                display_name: tool.displayName,
                slug_name: tool.slugName,
                is_model: tool.isModel,
            })),
            cloud_providers: worker.cloudProviders,
            workspaces: (workspacesByWorker.get(worker.id) || []).map((workspace) => ({
                id: workspace.id,
                name: workspace.name,
                created_at: workspace.createdAt,
                agents: (agentsByWorkspace.get(workspace.id) || []).map((agent) => ({
                    id: agent.id,
                    name: agent.name,
                    status: agent.status,
                    url: agent.url,
                    integration: agent.providerType,
                    github_branch_name: agent.githubBranchName,
                })),
            })),
        }));
    }),

    create: authedProcedure.input(workerInput).mutation(async ({ ctx, input }) => {
        const workerRepository = AppDataSource.getRepository(WorkerDefinition);
        const existing = await workerRepository.findOne({
            where: { slug: input.slug, userId: ctx.user.id },
        });
        if (existing)
            throw new TRPCError({
                code: 'CONFLICT',
                message: 'Slug already used',
            });

        const tools = await AppDataSource.getRepository(Tool).findBy({
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

        const providers = input.cloud_providers && input.cloud_providers.length > 0 ? input.cloud_providers : [{ name: 'Codee', agents: [{ model: null }] }];

        const worker = workerRepository.create({
            prompt: input.prompt,
            slug: input.slug,
            userId: ctx.user.id,
            cloudProviders: providers,
            key: input.key || null,
        });
        await workerRepository.save(worker);
        const linkRepository = AppDataSource.getRepository(WorkerDefinitionTool);
        const links = tools.map((tool) => linkRepository.create({ workerDefinition: worker, tool }));
        await linkRepository.save(links);
        return { id: worker.id };
    }),

    update: authedProcedure.input(workerInput.extend({ id: z.number() })).mutation(async ({ ctx, input }) => {
        const workerRepository = AppDataSource.getRepository(WorkerDefinition);
        const worker = await workerRepository.findOne({
            where: { id: input.id, userId: ctx.user.id },
        });
        if (!worker) throw new TRPCError({ code: 'NOT_FOUND' });

        const duplicate = await workerRepository.findOne({
            where: { slug: input.slug, userId: ctx.user.id },
        });
        if (duplicate && duplicate.id !== worker.id) {
            throw new TRPCError({
                code: 'CONFLICT',
                message: 'Slug already used',
            });
        }

        const tools = await AppDataSource.getRepository(Tool).findBy({
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

        const providers = input.cloud_providers && input.cloud_providers.length > 0 ? input.cloud_providers : [{ name: 'Codee', agents: [{ model: null }] }];

        worker.prompt = input.prompt;
        worker.slug = input.slug;
        worker.cloudProviders = providers;
        if (input.key) worker.key = input.key;
        await workerRepository.save(worker);
        const linkRepository = AppDataSource.getRepository(WorkerDefinitionTool);
        await linkRepository.delete({ workerDefinition: { id: worker.id } });
        const links = tools.map((tool) => linkRepository.create({ workerDefinition: worker, tool }));
        await linkRepository.save(links);
        return { ok: true };
    }),

    delete: authedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
        const workerRepository = AppDataSource.getRepository(WorkerDefinition);
        const worker = await workerRepository.findOne({
            where: { id: input.id, userId: ctx.user.id },
        });
        if (!worker) throw new TRPCError({ code: 'NOT_FOUND' });
        await workerRepository.remove(worker);
        return { ok: true };
    }),
});
