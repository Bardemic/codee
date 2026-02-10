import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { authedProcedure, router } from '../trpc';
import { AppDataSource } from '../../db/data-source';
import { Environment } from '../../db/entities/Environment';

const envFileSchema = z.object({
    path: z.string().min(1),
    content: z.string(),
});

const environmentInput = z.object({
    name: z.string().min(1).max(200),
    github_repository_name: z.string().min(1),
    description: z.string().optional(),
    files: z.array(envFileSchema).min(1),
});

export const environmentsRouter = router({
    list: authedProcedure.query(async ({ ctx }) => {
        const environments = await AppDataSource.getRepository(Environment).find({
            where: { organizationId: ctx.organization.id },
            order: { id: 'DESC' },
        });

        return environments.map((env) => ({
            id: env.id,
            name: env.name,
            github_repository_name: env.githubRepositoryName,
            description: env.description,
            files_count: env.files?.length || 0,
            file_paths: (env.files || []).map((f) => f.path),
        }));
    }),

    get: authedProcedure.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
        const environment = await AppDataSource.getRepository(Environment).findOne({
            where: { id: input.id, organizationId: ctx.organization.id },
        });
        if (!environment) throw new TRPCError({ code: 'NOT_FOUND' });

        return {
            id: environment.id,
            name: environment.name,
            github_repository_name: environment.githubRepositoryName,
            description: environment.description,
            created_at: environment.createdAt,
            updated_at: environment.updatedAt,
            files: environment.files || [],
        };
    }),

    listByRepository: authedProcedure.input(z.object({ github_repository_name: z.string() })).query(async ({ ctx, input }) => {
        const environments = await AppDataSource.getRepository(Environment).find({
            where: {
                organizationId: ctx.organization.id,
                githubRepositoryName: input.github_repository_name,
            },
            order: { name: 'ASC' },
        });

        return environments.map((env) => ({
            id: env.id,
            name: env.name,
            github_repository_name: env.githubRepositoryName,
            description: env.description,
            files_count: env.files?.length || 0,
        }));
    }),

    create: authedProcedure.input(environmentInput).mutation(async ({ ctx, input }) => {
        const environmentRepository = AppDataSource.getRepository(Environment);
        const existing = await environmentRepository.findOne({
            where: { name: input.name, organizationId: ctx.organization.id },
        });
        if (existing) {
            throw new TRPCError({
                code: 'CONFLICT',
                message: 'Environment name already used',
            });
        }

        const environment = environmentRepository.create({
            name: input.name,
            organizationId: ctx.organization.id,
            githubRepositoryName: input.github_repository_name,
            description: input.description || null,
            files: input.files,
        });
        await environmentRepository.save(environment);

        return { id: environment.id };
    }),

    update: authedProcedure.input(environmentInput.extend({ id: z.number() })).mutation(async ({ ctx, input }) => {
        const environmentRepository = AppDataSource.getRepository(Environment);
        const environment = await environmentRepository.findOne({
            where: { id: input.id, organizationId: ctx.organization.id },
        });
        if (!environment) throw new TRPCError({ code: 'NOT_FOUND' });

        const duplicate = await environmentRepository.findOne({
            where: { name: input.name, organizationId: ctx.organization.id },
        });
        if (duplicate && duplicate.id !== environment.id) {
            throw new TRPCError({
                code: 'CONFLICT',
                message: 'Environment name already used',
            });
        }

        environment.name = input.name;
        environment.githubRepositoryName = input.github_repository_name;
        environment.description = input.description || null;
        environment.files = input.files;
        await environmentRepository.save(environment);

        return { ok: true };
    }),

    delete: authedProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => {
        const environmentRepository = AppDataSource.getRepository(Environment);
        const environment = await environmentRepository.findOne({
            where: { id: input.id, organizationId: ctx.organization.id },
        });
        if (!environment) throw new TRPCError({ code: 'NOT_FOUND' });
        await environmentRepository.remove(environment);
        return { ok: true };
    }),
});
